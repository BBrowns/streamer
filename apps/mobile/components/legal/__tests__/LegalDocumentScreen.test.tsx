import React from "react";
import { render } from "@testing-library/react-native";
import { LegalDocumentScreen } from "../LegalDocumentScreen";

jest.mock("../../../hooks/useTheme", () => ({
  useTheme: () => ({
    colors: {
      background: "#08090C",
      text: "#F4F5F7",
      textSecondary: "#9DA3AE",
      tint: "#6C79F5",
    },
  }),
}));

jest.mock("../../../hooks/useWindowClass", () => ({
  useWindowClass: () => ({ isLarge: true }),
}));

describe("LegalDocumentScreen", () => {
  it("renders a readable document with one content title", async () => {
    const screen = await render(
      <LegalDocumentScreen
        testID="legal-document"
        title="Privacy policy"
        lastUpdated="Last updated: 11 August 2026"
        sections={[
          { title: "Information", body: "We explain what we collect." },
          { title: "Contact", body: "Contact us with questions." },
        ]}
      />,
    );

    expect(screen.getByTestId("legal-document")).toBeTruthy();
    expect(screen.getByText("Privacy policy")).toBeTruthy();
    expect(screen.getByText("Information")).toBeTruthy();
    expect(screen.getByText("We explain what we collect.")).toBeTruthy();
  });
});
