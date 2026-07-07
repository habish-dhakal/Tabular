"use client";

import { useState } from "react";
import {
  ChevronDown, Pencil, ArrowDownAZ, ArrowUpAZ, EyeOff, Trash2, Group,
} from "lucide-react";
import { Popover } from "@/components/ui/Popover";
import { FieldEditor } from "@/components/table/FieldEditor";
import { useTable } from "@/components/table/TableProvider";
import { useDialog } from "@/components/ui/DialogProvider";
import type { FieldDTO } from "@/lib/types";

export function FieldHeaderMenu({ field }: { field: FieldDTO }) {
  return (
    <Popover
      width={280}
      trigger={() => (
        <button className="text-muted hover:text-foreground" title="Field options">
          <ChevronDown size={14} />
        </button>
      )}
    >
      {(close) => <MenuBody field={field} close={close} />}
    </Popover>
  );
}

function MenuBody({ field, close }: { field: FieldDTO; close: () => void }) {
  const { updateConfig, config, updateField, deleteField } = useTable();
  const dialog = useDialog();
  const [editing, setEditing] = useState(false);

  if (editing) {
    return (
      <FieldEditor
        field={field}
        onSave={(data) => updateField(field.id, data)}
        onClose={close}
      />
    );
  }

  const item = "flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-surface";
  return (
    <div className="space-y-0.5">
      <button className={item} onClick={() => setEditing(true)}>
        <Pencil size={14} /> Edit field
      </button>
      <button className={item} onClick={() => { updateConfig({ sorts: [{ fieldId: field.id, direction: "asc" }] }); close(); }}>
        <ArrowDownAZ size={14} /> Sort A → Z
      </button>
      <button className={item} onClick={() => { updateConfig({ sorts: [{ fieldId: field.id, direction: "desc" }] }); close(); }}>
        <ArrowUpAZ size={14} /> Sort Z → A
      </button>
      <button className={item} onClick={() => { updateConfig({ groupBy: field.id }); close(); }}>
        <Group size={14} /> Group by this field
      </button>
      {!field.isPrimary && (
        <>
          <button
            className={item}
            onClick={() => {
              const hidden = new Set(config.hiddenFieldIds ?? []);
              hidden.add(field.id);
              updateConfig({ hiddenFieldIds: [...hidden] });
              close();
            }}
          >
            <EyeOff size={14} /> Hide field
          </button>
          <button
            className={item + " text-red-600"}
            onClick={async () => {
              if (await dialog.confirm({ title: "Delete field?", message: `"${field.name}" and all its data will be removed.`, confirmLabel: "Delete", danger: true })) {
                deleteField(field.id);
                close();
              }
            }}
          >
            <Trash2 size={14} /> Delete field
          </button>
        </>
      )}
    </div>
  );
}
