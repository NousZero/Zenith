/* eslint-disable react-refresh/only-export-components -- Radix primitives re-exported as-is. */
import * as PopoverPrimitive from "@radix-ui/react-popover";
import type { ComponentProps } from "react";

import { cn } from "../../lib/utils";

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export function PopoverContent({
  className,
  align = "end",
  sideOffset = 6,
  ...props
}: ComponentProps<typeof PopoverPrimitive.Content>) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={sideOffset}
        className={cn(
          "material z-50 origin-(--radix-popover-content-transform-origin) rounded-xl border border-border p-4 text-popover-foreground outline-none data-[state=open]:animate-materialize-in data-[state=closed]:animate-materialize-out",
          className,
        )}
        {...props}
      />
    </PopoverPrimitive.Portal>
  );
}
