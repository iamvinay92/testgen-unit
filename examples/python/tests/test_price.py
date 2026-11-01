import unittest

from price import discount


class DiscountTests(unittest.TestCase):
    def test_discount(self):
        self.assertEqual(discount(100, 20), 80)
        self.assertEqual(discount(100, 100), 0)

    def test_invalid_inputs(self):
        for total, percent in [(-1, 20), (100, -1), (100, 101)]:
            with self.subTest(total=total, percent=percent):
                with self.assertRaises(ValueError):
                    discount(total, percent)
