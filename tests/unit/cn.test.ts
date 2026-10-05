import { describe, it, expect } from "vitest";
import { cn } from "@/lib/utils/cn";

describe("cn utility", () => {
  it("merges conflicting Tailwind classes", () => {
    expect(cn("px-2 px-4")).toBe("px-4");
    expect(cn("text-red-500 text-blue-500")).toBe("text-blue-500");
    expect(cn("rounded-md rounded-lg")).toBe("rounded-lg");
  });

  it("preserves non-conflicting classes", () => {
    expect(cn("px-2 py-2")).toBe("px-2 py-2");
    expect(cn("flex items-center justify-center")).toBe("flex items-center justify-center");
  });

  it("handles conditional classes", () => {
    expect(cn("base", true && "conditional")).toBe("base conditional");
    expect(cn("base", false && "conditional")).toBe("base");
    expect(cn("base", null, undefined, "valid")).toBe("base valid");
  });

  it("handles array and object inputs", () => {
    expect(cn(["px-2", "py-2"])).toBe("px-2 py-2");
    expect(cn({ "px-2": true, "py-2": false })).toBe("px-2");
  });

  it("merges complex conflicting utilities", () => {
    expect(cn("bg-red-500 hover:bg-red-600", "bg-blue-500")).toBe("hover:bg-red-600 bg-blue-500");
    expect(cn("w-full md:w-1/2 lg:w-1/3", "w-auto")).toBe("md:w-1/2 lg:w-1/3 w-auto");
  });
});
