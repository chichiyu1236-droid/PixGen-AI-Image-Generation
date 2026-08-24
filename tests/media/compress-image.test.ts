import { describe, expect, it } from "vitest";
import { targetDimensions } from "@/lib/media/compress-image";

describe("targetDimensions", () => {
  it("downscales landscape images to a 1024px longest edge", () => {
    expect(targetDimensions(4000, 3000)).toEqual({ width: 1024, height: 768 });
  });

  it("downscales portrait images to a 1024px longest edge", () => {
    expect(targetDimensions(3000, 4000)).toEqual({ width: 768, height: 1024 });
  });

  it("downscales square images to 1024x1024", () => {
    expect(targetDimensions(2000, 2000)).toEqual({ width: 1024, height: 1024 });
  });

  it("keeps images within the cap at their original size", () => {
    expect(targetDimensions(800, 600)).toEqual({ width: 800, height: 600 });
    expect(targetDimensions(1024, 768)).toEqual({ width: 1024, height: 768 });
  });

  it("honours a custom max edge", () => {
    expect(targetDimensions(4000, 2000, 512)).toEqual({ width: 512, height: 256 });
  });
});
