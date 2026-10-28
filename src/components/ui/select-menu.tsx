"use client";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { ChevronDown } from "lucide-react";
import { useCallback, useMemo, useRef, useState } from "react";

export type SelectMenuOption = { value: string; label: string };

export type SelectMenuProps = {
  value: string;
  onValueChange: (value: string) => void;
  options: SelectMenuOption[];
  disabled?: boolean;
  align?: "start" | "end" | "center";
  sideOffset?: number;
  /** Wrapper (width, etc.) */
  className?: string;
  /** Si es false, el disparador no ocupa todo el ancho (p. ej. ordenar en barra). */
  fullWidth?: boolean;
  id?: string;
  "aria-label"?: string;
  triggerClassName?: string;
  contentClassName?: string;
  radioItemClassName?: string;
  /**
   * Dentro de un `Dialog`, el menú se portalea al `body` y `react-remove-scroll`
   * no reenvía la rueda al scroll del modal. Pasa el `ref` del contenedor con
   * `overflow-y-auto` (p. ej. el cuerpo del formulario) para que el scroll funcione
   * con el desplegable abierto.
   */
  nestedScrollParentRef?: React.RefObject<HTMLElement | null>;
  /** Campo de búsqueda encima de la lista (filtra por etiqueta y valor). */
  searchable?: boolean;
  searchPlaceholder?: string;
  /** Mensaje si no hay coincidencias (solo con `searchable`). */
  emptySearchMessage?: string;
};

/**
 * Select estilizado con menú desplegable (Radix), mismo patrón que el orden en /courses.
 * Sustituye al select nativo (lista del sistema, bordes cuadrados).
 */
export function SelectMenu({
  value,
  onValueChange,
  options,
  disabled,
  align = "start",
  sideOffset = 6,
  className,
  fullWidth = true,
  id,
  "aria-label": ariaLabel,
  triggerClassName,
  contentClassName,
  radioItemClassName,
  nestedScrollParentRef,
  searchable = false,
  searchPlaceholder = "Search…",
  emptySearchMessage = "No results",
}: SelectMenuProps) {
  const listScrollRef = useRef<HTMLDivElement>(null);
  const menuWheelCleanupRef = useRef<(() => void) | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const [menuOpen, setMenuOpen] = useState(false);
  const [query, setQuery] = useState("");

  const handleOpenChange = useCallback((open: boolean) => {
    setMenuOpen(open);
    if (!open) setQuery("");
  }, []);

  /**
   * React registra onWheel como pasivo: preventDefault no frena el bloqueo de
   * react-remove-scroll en document. Listener nativo { passive:false } en burbuja
   * sobre el panel: corta la propagación hacia document cuando la lista interna
   * debe hacer scroll, o desplaza el contenedor del modal en caso contrario.
   */
  const menuContentRefCallback = useCallback(
    (el: HTMLDivElement | null) => {
      menuWheelCleanupRef.current?.();
      menuWheelCleanupRef.current = null;

      if (!el || !nestedScrollParentRef) return;

      const handler = (e: WheelEvent) => {
        const parent = nestedScrollParentRef.current;
        if (!parent) return;

        const inner = listScrollRef.current;
        if (inner && e.target instanceof Node && inner.contains(e.target)) {
          if (inner.scrollHeight > inner.clientHeight + 1) {
            const { scrollTop, scrollHeight, clientHeight } = inner;
            const dy = e.deltaY;
            if (dy < 0 && scrollTop > 0) {
              e.stopPropagation();
              return;
            }
            if (dy > 0 && scrollTop + clientHeight < scrollHeight - 1) {
              e.stopPropagation();
              return;
            }
          }
        }

        parent.scrollTop += e.deltaY;
        e.preventDefault();
        e.stopPropagation();
      };

      el.addEventListener("wheel", handler, { passive: false });
      menuWheelCleanupRef.current = () => {
        el.removeEventListener("wheel", handler);
      };
    },
    [nestedScrollParentRef]
  );

  const filteredOptions = useMemo(() => {
    if (!searchable) return options;
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => {
      const label = o.label.toLowerCase();
      const val = o.value.toLowerCase();
      return label.includes(q) || val.includes(q);
    });
  }, [options, query, searchable]);

  const currentLabel = useMemo(() => {
    const hit = options.find((o) => o.value === value);
    if (hit) return hit.label;
    return options[0]?.label ?? "";
  }, [options, value]);

  return (
    <div
      className={cn(
        "inline-flex min-w-0",
        fullWidth ? "w-full" : "w-auto",
        className
      )}
    >
      <DropdownMenu
        modal={false}
        open={menuOpen}
        onOpenChange={handleOpenChange}
      >
        <DropdownMenuTrigger asChild disabled={disabled}>
          <Button
            type="button"
            variant="outline"
            id={id}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            aria-label={ariaLabel}
            disabled={disabled}
            className={cn(
              "h-10 min-w-0 justify-between gap-2 rounded-ft border border-input bg-background px-3 text-left text-sm font-normal shadow-sm hover:bg-accent/40",
              fullWidth ? "w-full" : "w-max min-w-[11rem]",
              triggerClassName
            )}
          >
            <span className="truncate">{currentLabel}</span>
            <ChevronDown className="h-4 w-4 shrink-0 opacity-70" aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          ref={nestedScrollParentRef ? menuContentRefCallback : undefined}
          align={align}
          sideOffset={sideOffset}
          onOpenAutoFocus={
            searchable
              ? (e: Event) => {
                  e.preventDefault();
                  queueMicrotask(() => searchInputRef.current?.focus());
                }
              : undefined
          }
          className={cn(
            "z-50 min-w-[var(--radix-dropdown-menu-trigger-width)] overflow-hidden rounded-ft border bg-popover p-0 text-popover-foreground shadow-lg",
            contentClassName
          )}
        >
          {searchable ? (
            <div
              className="sticky top-0 z-10 border-b border-border bg-popover p-2"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Input
                ref={searchInputRef}
                id={id ? `${id}-search` : undefined}
                type="search"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={searchPlaceholder}
                aria-label={searchPlaceholder}
                className="h-9"
                onKeyDown={(e) => e.stopPropagation()}
              />
            </div>
          ) : null}
          <div
            ref={listScrollRef}
            className="max-h-72 overflow-y-auto overflow-x-hidden"
          >
            {searchable && filteredOptions.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {emptySearchMessage}
              </p>
            ) : (
              <DropdownMenuRadioGroup
                value={value}
                onValueChange={onValueChange}
                className="p-0"
              >
                {filteredOptions.map((opt) => (
                  <DropdownMenuRadioItem
                    key={opt.value === "" ? "__empty" : opt.value}
                    value={opt.value}
                    className={cn(
                      "cursor-pointer rounded-none py-2 pl-8 pr-3 text-sm outline-none",
                      "focus:bg-accent focus:text-accent-foreground data-[state=checked]:bg-primary/12 data-[state=checked]:font-semibold",
                      radioItemClassName
                    )}
                  >
                    {opt.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
