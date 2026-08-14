import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function PasswordInput(props: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
  id?: string;
  name?: string;
  
  className?: string;
}) {
  return (
    <Input
      type="password"
      autoComplete="current-password"
      autoFocus={props.autoFocus}
      id={props.id}
      name={props.name}
      placeholder={props.placeholder ?? "Password"}
      className={cn(
        "h-11 rounded-2xl px-4 py-2.5 text-[15px]",
        props.className,
      )}
      value={props.value}
      onChange={(e) => props.onChange(e.target.value)}
    />
  );
}
