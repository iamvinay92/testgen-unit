package price

import "fmt"

// Discount returns a total after applying a percentage discount.
func Discount(total, percent int) (int, error) {
	if total < 0 || percent < 0 || percent > 100 {
		return 0, fmt.Errorf("invalid total or discount")
	}
	return total * (100 - percent) / 100, nil
}
