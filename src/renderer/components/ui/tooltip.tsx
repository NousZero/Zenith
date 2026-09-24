/* eslint-disable react-refresh/only-export-components -- Radix primitives re-exported as-is. */
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import type { ComponentProps } from "react";

import { cn } from "../../lib/utils";

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export function TooltipContent({
  className,
  sideOffset = 6,
  ...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        sideOffset={sideOffset}
        className={cn(
          "material z-50 origin-(--radix-tooltip-content-transform-origin) rounded-md border border-border px-2 py-1 text-xs text-popover-foreground data-[state=delayed-open]:animate-materialize-in data-[state=closed]:animate-materialize-out",
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
}
