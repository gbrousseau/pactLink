"use client";

export function ReportGroupSelect({ groups, selected }: { groups: { id: string; name: string }[]; selected: string }) {
  return <label className="text-sm font-semibold">Group
    <select className="input mt-2" name="group" defaultValue={selected} onChange={(event) => {
      const select = event.currentTarget;
      const form = select.form;
      if (!form) return;
      if (!form.checkValidity()) select.value = selected;
      form.requestSubmit();
    }}>
      <option value="">All groups (separate reports)</option>
      {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
    </select>
  </label>;
}
