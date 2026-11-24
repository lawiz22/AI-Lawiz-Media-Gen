import unittest

from calc import average


class AverageTest(unittest.TestCase):
    def test_average(self):
        self.assertEqual(average([1, 2, 3]), 2)


if __name__ == "__main__":
    unittest.main()
