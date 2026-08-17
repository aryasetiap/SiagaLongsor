#include <unity.h>

#include <cmath>

#include "sensor_logic.hpp"

namespace {

constexpr float EPSILON = 0.001F;

void test_shortest_difference_without_boundary_crossing() {
  TEST_ASSERT_FLOAT_WITHIN(EPSILON, 7.5F, firmware::shortestSignedAngleDifference(12.0F, 4.5F));
}

void test_shortest_difference_wraps_positive_reading_past_negative_reference() {
  TEST_ASSERT_FLOAT_WITHIN(EPSILON, -2.63F,
                           firmware::shortestSignedAngleDifference(179.50F, -177.87F));
}

void test_shortest_difference_wraps_negative_reading_past_positive_reference() {
  TEST_ASSERT_FLOAT_WITHIN(EPSILON, 2.0F, firmware::shortestSignedAngleDifference(-179.0F, 179.0F));
}

void test_shortest_difference_is_zero_for_equal_angles() {
  TEST_ASSERT_FLOAT_WITHIN(EPSILON, 0.0F, firmware::shortestSignedAngleDifference(-177.87F, -177.87F));
}

void test_reference_application_recomputes_magnitude_from_corrected_deltas() {
  const firmware::TiltReading rawReading{179.50F, -179.0F, 0.0F};
  const firmware::TiltReference reference{-177.87F, 179.0F, true};

  const firmware::TiltReading corrected = firmware::applyTiltReference(rawReading, reference);

  TEST_ASSERT_FLOAT_WITHIN(EPSILON, -2.63F, corrected.xDeg);
  TEST_ASSERT_FLOAT_WITHIN(EPSILON, 2.0F, corrected.yDeg);
  TEST_ASSERT_FLOAT_WITHIN(EPSILON, sqrtf((-2.63F * -2.63F) + (2.0F * 2.0F)),
                           corrected.magnitudeDeg);
}

}  // namespace

void setup() {
  UNITY_BEGIN();
  RUN_TEST(test_shortest_difference_without_boundary_crossing);
  RUN_TEST(test_shortest_difference_wraps_positive_reading_past_negative_reference);
  RUN_TEST(test_shortest_difference_wraps_negative_reading_past_positive_reference);
  RUN_TEST(test_shortest_difference_is_zero_for_equal_angles);
  RUN_TEST(test_reference_application_recomputes_magnitude_from_corrected_deltas);
  UNITY_END();
}

void loop() {}
