import { describe, it, expect } from "vitest";
import {
  parseFunctionTagCalls,
  stripFunctionTagCalls,
  getCaideWriteTags,
} from "./caideTagParser.ts";

const LEAKED_WRITE = `<function=write_file>
<parameter=content>import { View } from "react-native";
export default function P() { return <View />; }</parameter>
<parameter=path>app/(delivery)/profile.tsx</parameter>
</function>`;

describe("function-tag tool call recovery", () => {
  it("parses the leaked write_file dialect", () => {
    const calls = parseFunctionTagCalls(`Some prose\n${LEAKED_WRITE}\n1:09 AM`);
    expect(calls).toHaveLength(1);
    expect(calls[0].name).toBe("write_file");
    expect(calls[0].args.path).toBe("app/(delivery)/profile.tsx");
    expect(calls[0].args.content).toContain('import { View } from "react-native"');
    expect(calls[0].raw).toContain("<function=write_file>");
  });

  it("handles quoted and attribute forms", () => {
    expect(parseFunctionTagCalls('<function="read_file"><parameter="path">a.ts</parameter></function>')[0].name).toBe(
      "read_file",
    );
    expect(
      parseFunctionTagCalls('<function name="grep"><parameter=pattern>x</parameter></function>')[0].args,
    ).toEqual({ pattern: "x" });
  });

  it("parses multiple blocks and is case-insensitive", () => {
    const text = `<FUNCTION=read_file><PARAMETER=path>a.ts</PARAMETER></FUNCTION> then <function=list_dir><parameter=path></parameter></function>`;
    const calls = parseFunctionTagCalls(text);
    expect(calls.map((c) => c.name)).toEqual(["read_file", "list_dir"]);
    expect(calls[1].args.path).toBe("");
  });

  it("ignores malformed blocks", () => {
    expect(parseFunctionTagCalls("no tags here")).toEqual([]);
    expect(parseFunctionTagCalls("<function=write_file><parameter=path>a.ts</parameter>")).toEqual([]);
    expect(parseFunctionTagCalls("<function=> <parameter=x>y</parameter></function>")).toEqual([]);
  });

  it("strips blocks from displayed text", () => {
    const stripped = stripFunctionTagCalls(`Before\n${LEAKED_WRITE}\nAfter`);
    expect(stripped).not.toContain("<function");
    expect(stripped).toContain("Before");
    expect(stripped).toContain("After");
  });

  it("dyad-write tags still parse for write_file mapping", () => {
    const tags = getCaideWriteTags('<dyad-write path="src/A.tsx" description="d">hello</dyad-write>');
    expect(tags).toEqual([{ path: "src/A.tsx", content: "hello", description: "d" }]);
  });
});
