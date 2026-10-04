"use client";

import type { ComponentProps } from "react";
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group";

type Props = Omit<ComponentProps<"input">, "type" | "inputMode" | "value" | "onChange"> & {
  value: string;
  onChange: (value: string) => void;
  unit?: string;
};

export function MoneyInput({ value, onChange, unit = "zł", className, ...props }: Props) {
  return (
    <InputGroup className={className}>
      <InputGroupInput
        type="text"
        inputMode="decimal"
        autoComplete="off"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="tabular-nums"
        {...props}
      />
      <InputGroupAddon align="inline-end">{unit}</InputGroupAddon>
    </InputGroup>
  );
}
