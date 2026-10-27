import { Fragment } from "react";

const MARK_START = "\u0002";
const MARK_END = "\u0003";

export function Marked({ text }: { text: string }) {
  return (
    <>
      {text.split(MARK_START).map((chunk, index) => {
        if (index === 0) return <Fragment key={index}>{chunk}</Fragment>;
        const end = chunk.indexOf(MARK_END);
        if (end === -1) return <Fragment key={index}>{chunk}</Fragment>;
        return (
          <Fragment key={index}>
            <mark className="rounded-[3px] bg-primary/15 px-px text-foreground">
              {chunk.slice(0, end)}
            </mark>
            {chunk.slice(end + 1)}
          </Fragment>
        );
      })}
    </>
  );
}
