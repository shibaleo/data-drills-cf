"use client";

import { useState, useEffect, useCallback } from "react";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { usePageTitle } from "@/lib/page-context";
import { Fab } from "@/components/shared/fab";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { api, ApiError, fetchAllPages } from "@/lib/api-client";

interface ApiKeyRow {
  id: string;
  name: string;
  key_prefix: string;
  is_active: boolean;
  last_used_at: string | null;
  created_at: string;
}

export default function ApiKeysPage() {
  usePageTitle("API Keys");
  const [items, setItems] = useState<ApiKeyRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newKeyName, setNewKeyName] = useState("");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAllPages<ApiKeyRow>("/api-keys");
      setItems(data);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "Failed to fetch API keys");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleCreate = async () => {
    if (!newKeyName.trim()) return;
    setSaving(true);
    try {
      const res = await api.post<{ data: { raw_key: string } }>("/api-keys", { name: newKeyName.trim() });
      setCreatedKey(res.data.raw_key);
      fetchItems();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "Failed to create");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await api.patch("/api-keys/" + id, { is_active: false });
      toast.success("API key deactivated");
      fetchItems();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "Failed to deactivate");
    }
  };

  const handleCopy = async () => {
    if (!createdKey) return;
    await navigator.clipboard.writeText(createdKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="p-4 md:p-6">
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No API keys</div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border/30">
                  <td className="py-2 px-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs text-muted-foreground">{item.key_prefix}...</span>
                        <span>{item.name}</span>
                        {!item.is_active && (
                          <Badge className="bg-red-900/30 text-red-400 border-red-800/50 text-xs py-0">Disabled</Badge>
                        )}
                      </div>
                      {item.is_active && (
                        <Button variant="outline" size="sm" className="text-destructive" onClick={() => handleDeactivate(item.id)}>
                          Deactivate
                        </Button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New API Key</DialogTitle>
            <DialogDescription>Create a new API key.</DialogDescription>
          </DialogHeader>

          {createdKey ? (
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Your API key has been created. This key will only be shown once. Make sure to copy it.
              </p>
              <div className="flex items-center gap-2">
                <Input value={createdKey} readOnly className="font-mono text-xs" />
                <Button variant="outline" size="icon" onClick={handleCopy}>
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Key Name</Label>
                <Input value={newKeyName} onChange={(e) => setNewKeyName(e.target.value)} placeholder="e.g. CLI" />
              </div>
            </div>
          )}

          <DialogFooter>
            {createdKey ? (
              <Button onClick={() => setCreateOpen(false)}>Close</Button>
            ) : (
              <>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
                <Button onClick={handleCreate} disabled={saving}>{saving ? "Creating..." : "Create"}</Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Fab onClick={() => { setNewKeyName(""); setCreatedKey(null); setCreateOpen(true); }} />
    </div>
  );
}
