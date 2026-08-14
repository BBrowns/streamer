import * as React from "react";
import { act } from "react";
import { createRoot } from "test-renderer";

import { MonoText } from "../StyledText";

it(`renders correctly`, async () => {
  const component = createRoot({
    textComponentTypes: ["Text"],
  });
  await act(async () => {
    component.render(<MonoText>Snapshot test!</MonoText>);
  });

  expect(component.container.children[0].toJSON()).toMatchSnapshot();

  await act(async () => {
    component.unmount();
  });
});
