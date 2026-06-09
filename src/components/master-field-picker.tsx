"use client";

import { useMasterField } from "@/hooks/use-master-field";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown } from "lucide-react";

export function MasterFieldPicker() {
  const { fields, field, setField } = useMasterField();
  if (fields.length === 0) return null;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-1">
          {field?.name ?? "Select field"}
          <ChevronDown className="size-3" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-56 p-1" align="start">
        <div className="flex flex-col">
          {fields.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setField(f)}
              className={`text-left px-2 py-1.5 rounded text-sm hover:bg-accent ${
                f.id === field?.id ? "bg-accent" : ""
              }`}
            >
              {f.name}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
