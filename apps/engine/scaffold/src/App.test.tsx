import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import App from "./App";

describe("generated application shell", () => {
  it("renders the default route", () => {
    render(<App />);

    expect(
      screen.getByRole("heading", { name: /build the first screen/i }),
    ).toBeInTheDocument();
  });
});
