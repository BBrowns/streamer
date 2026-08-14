import React from "react";
import { render } from "@testing-library/react-native";
import { BrandIllustration } from "../BrandIllustration";

describe("BrandIllustration", () => {
  it("keeps bundled brand artwork behind one accessible visual contract", async () => {
    const screen = await render(
      <BrandIllustration
        testID="brand-art"
        source={{ uri: "bundled-artwork" }}
        contentFit="contain"
        accessibilityLabel="Streamer artwork"
      />,
    );

    expect(screen.getByTestId("brand-art")).toBeTruthy();
    expect(screen.getByLabelText("Streamer artwork")).toBeTruthy();
  });
});
