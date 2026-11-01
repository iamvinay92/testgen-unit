def discount(total: int, percent: int) -> int:
    """Return the total after applying an integer percentage discount."""
    if total < 0 or not 0 <= percent <= 100:
        raise ValueError("invalid total or discount")
    return total * (100 - percent) // 100
