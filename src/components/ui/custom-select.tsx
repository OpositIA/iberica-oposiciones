import * as React from "react";

import { cn } from "@/lib/utils";

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue
} from "./select";

const EMPTY_OPTION_VALUE = "__custom_select_empty_option__";

type NativeSelectProps = Omit<
  React.ComponentPropsWithoutRef<"select">,
  "children" | "multiple" | "size"
>;

type ParsedOption = {
  disabled: boolean;
  key: React.Key;
  label: React.ReactNode;
  value: string;
};

type ParsedGroup = {
  key: React.Key;
  label?: React.ReactNode;
  options: ParsedOption[];
};

export type CustomSelectProps = NativeSelectProps & {
  children: React.ReactNode;
  contentClassName?: string;
  placeholder?: string;
};

const normalizeSelectValue = (value: unknown): string => {
  if (Array.isArray(value)) return String(value[0] ?? "");
  if (value == null) return "";
  return String(value);
};

const getFallbackOptionValue = (children: React.ReactNode) =>
  React.Children.toArray(children)
    .map((node) => {
      if (typeof node === "string" || typeof node === "number")
        return String(node);
      return "";
    })
    .join("")
    .trim();

const parseOption = (
  optionNode: React.ReactElement<React.OptionHTMLAttributes<HTMLOptionElement>>,
  fallbackKey: React.Key,
  inheritedDisabled = false
): ParsedOption => {
  const optionValue =
    optionNode.props.value == null
      ? getFallbackOptionValue(optionNode.props.children)
      : String(optionNode.props.value);

  return {
    key: optionNode.key ?? fallbackKey,
    value: optionValue,
    label: optionNode.props.children,
    disabled: inheritedDisabled || Boolean(optionNode.props.disabled)
  };
};

const parseChildren = (children: React.ReactNode): ParsedGroup[] => {
  const topLevelOptions: ParsedOption[] = [];
  const groups: ParsedGroup[] = [];

  React.Children.forEach(children, (child, index) => {
    if (!React.isValidElement(child)) return;

    if (child.type === "option") {
      topLevelOptions.push(
        parseOption(
          child as React.ReactElement<
            React.OptionHTMLAttributes<HTMLOptionElement>
          >,
          `option-${index}`
        )
      );
      return;
    }

    if (child.type !== "optgroup") return;

    const groupNode = child as React.ReactElement<
      React.OptgroupHTMLAttributes<HTMLOptGroupElement>
    >;
    const groupOptions: ParsedOption[] = [];

    React.Children.forEach(
      groupNode.props.children,
      (optionChild, optionIndex) => {
        if (!React.isValidElement(optionChild) || optionChild.type !== "option")
          return;

        groupOptions.push(
          parseOption(
            optionChild as React.ReactElement<
              React.OptionHTMLAttributes<HTMLOptionElement>
            >,
            `${index}-option-${optionIndex}`,
            Boolean(groupNode.props.disabled)
          )
        );
      }
    );

    if (groupOptions.length === 0) return;

    groups.push({
      key: groupNode.key ?? `group-${index}`,
      label: groupNode.props.label,
      options: groupOptions
    });
  });

  if (topLevelOptions.length > 0) {
    groups.unshift({
      key: "root-options",
      options: topLevelOptions
    });
  }

  return groups;
};

const mapOptionValue = (value: string) =>
  value === "" ? EMPTY_OPTION_VALUE : value;

const unmapOptionValue = (value: string) =>
  value === EMPTY_OPTION_VALUE ? "" : value;

const CustomSelect = React.forwardRef<HTMLButtonElement, CustomSelectProps>(
  (
    {
      autoComplete,
      children,
      className,
      contentClassName,
      defaultValue,
      disabled,
      form,
      id,
      name,
      onBlur,
      onChange,
      placeholder,
      required,
      value
    },
    ref
  ) => {
    const optionGroups = React.useMemo(
      () => parseChildren(children),
      [children]
    );
    const isControlled = value !== undefined;
    const [uncontrolledValue, setUncontrolledValue] = React.useState(() =>
      normalizeSelectValue(defaultValue)
    );

    const currentValue = isControlled
      ? normalizeSelectValue(value)
      : uncontrolledValue;

    const handleValueChange = React.useCallback(
      (nextValue: string) => {
        const normalizedValue = unmapOptionValue(nextValue);

        if (!isControlled) setUncontrolledValue(normalizedValue);
        if (!onChange) return;

        const syntheticTarget = {
          name,
          value: normalizedValue
        } as EventTarget & HTMLSelectElement;

        onChange({
          target: syntheticTarget,
          currentTarget: syntheticTarget
        } as React.ChangeEvent<HTMLSelectElement>);
      },
      [isControlled, name, onChange]
    );

    const handleBlur = React.useCallback(
      (event: React.FocusEvent<HTMLButtonElement>) => {
        if (!onBlur) return;
        onBlur(event as unknown as React.FocusEvent<HTMLSelectElement>);
      },
      [onBlur]
    );

    return (
      <Select
        autoComplete={autoComplete}
        disabled={disabled}
        form={form}
        name={name}
        onValueChange={handleValueChange}
        required={required}
        value={mapOptionValue(currentValue)}
      >
        <SelectTrigger
          ref={ref}
          className={cn(
            "h-auto min-h-10 transition-colors duration-200 data-[placeholder]:text-muted-foreground",
            className
          )}
          id={id}
          onBlur={handleBlur}
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className={contentClassName}>
          {optionGroups.map((group) => (
            <SelectGroup key={group.key}>
              {group.label ? <SelectLabel>{group.label}</SelectLabel> : null}
              {group.options.map((option) => (
                <SelectItem
                  disabled={option.disabled}
                  key={option.key}
                  value={mapOptionValue(option.value)}
                >
                  {option.label}
                </SelectItem>
              ))}
            </SelectGroup>
          ))}
        </SelectContent>
      </Select>
    );
  }
);

CustomSelect.displayName = "CustomSelect";

export default CustomSelect;
