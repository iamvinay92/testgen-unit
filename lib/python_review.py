"""Static test heuristics. Reads source with ast; never imports target code."""
import ast
import json
import sys


def review(path):
    findings = []

    def add(node, category, message):
        findings.append({"file": path, "line": getattr(node, "lineno", 1), "category": category, "message": message})

    with open(path, encoding="utf-8") as source:
        try:
            tree = ast.parse(source.read(), filename=path)
        except SyntaxError as error:
            findings.append({"file": path, "line": error.lineno, "category": "syntax", "message": str(error)})
            return findings

    for scope in [tree, *[n for n in ast.walk(tree) if isinstance(n, ast.ClassDef)]]:
        names = set()
        bodies = {}
        for node in scope.body:
            if not isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) or not node.name.startswith("test"):
                continue
            if node.name in names:
                add(node, "duplicate-test", f"Duplicate test {node.name} in the same scope shadows an earlier definition.")
            names.add(node.name)
            body = node.body
            if body and isinstance(body[0], ast.Expr) and isinstance(body[0].value, ast.Constant) and isinstance(body[0].value.value, str):
                body = body[1:]
            signature = (
                type(node).__name__,
                ast.dump(node.args, include_attributes=False),
                tuple(ast.dump(decorator, include_attributes=False) for decorator in node.decorator_list),
                ast.dump(ast.Module(body=body, type_ignores=[]), include_attributes=False),
            )
            if body and signature in bodies and bodies[signature] != node.name:
                add(node, "duplicate-test-body", f"{node.name} repeats the exact body of {bodies[signature]} with identical parameters and decorators; remove redundant tests or clarify distinct behavior.")
            else:
                bodies[signature] = node.name
            assertions = []
            for child in ast.walk(node):
                if isinstance(child, ast.Assert):
                    assertions.append(child)
                if isinstance(child, ast.Call):
                    name = child.func.attr if isinstance(child.func, ast.Attribute) else getattr(child.func, "id", "")
                    if name.startswith("assert") or name in ("raises", "fail"):
                        assertions.append(child)
            if not assertions:
                add(node, "weak-assertion", "No recognizable assertion; inspect fixtures and custom helpers.")
    for node in ast.walk(tree):
        if isinstance(node, ast.Call):
            name = node.func.attr if isinstance(node.func, ast.Attribute) else getattr(node.func, "id", "")
            if name == "sleep":
                add(node, "nondeterminism", "Sleep detected; prefer fake clocks or deterministic synchronization.")
    return findings


if __name__ == "__main__":
    print(json.dumps([finding for path in sys.argv[1:] for finding in review(path)]))
