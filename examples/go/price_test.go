package price

import "testing"

func TestDiscount(t *testing.T) {
	for _, tc := range []struct{ total, percent, want int; invalid bool }{
		{100, 20, 80, false}, {100, 100, 0, false}, {-1, 20, 0, true}, {100, 101, 0, true},
	} {
		got, err := Discount(tc.total, tc.percent)
		if (err != nil) != tc.invalid || got != tc.want {
			t.Fatalf("Discount(%d,%d) = %d, %v", tc.total, tc.percent, got, err)
		}
	}
}
