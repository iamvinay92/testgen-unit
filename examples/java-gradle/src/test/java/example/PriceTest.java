package example;

import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class PriceTest {
    @Test
    void appliesDiscount() {
        assertEquals(80, Price.discount(100, 20));
        assertEquals(0, Price.discount(100, 100));
    }

    @Test
    void rejectsInvalidInputs() {
        assertThrows(IllegalArgumentException.class, () -> Price.discount(-1, 20));
        assertThrows(IllegalArgumentException.class, () -> Price.discount(100, -1));
        assertThrows(IllegalArgumentException.class, () -> Price.discount(100, 101));
    }
}
