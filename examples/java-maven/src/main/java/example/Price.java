package example;

public final class Price {
    private Price() {}

    public static int discount(int total, int percent) {
        if (total < 0 || percent < 0 || percent > 100) {
            throw new IllegalArgumentException("invalid total or discount");
        }
        return total * (100 - percent) / 100;
    }
}
