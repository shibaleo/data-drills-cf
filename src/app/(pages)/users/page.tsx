"use client";

import { useState, useEffect, useCallback } from "react";
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

interface UserRow {
  id: string;
  email: string;
  name: string;
  isActive: boolean;
  createdAt: string;
}

export default function UsersPage() {
  usePageTitle("Users");
  const [items, setItems] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);

  // Create dialog
  const [createOpen, setCreateOpen] = useState(false);
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);

  // Password dialog
  const [pwOpen, setPwOpen] = useState(false);
  const [pwUser, setPwUser] = useState<UserRow | null>(null);
  const [newPassword, setNewPassword] = useState("");

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAllPages<UserRow>("/users");
      setItems(data);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "Failed to fetch users");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleCreate = async () => {
    if (!newEmail.trim() || !newName.trim()) {
      toast.error("Email and name are required");
      return;
    }
    setSaving(true);
    try {
      await api.post("/users", { email: newEmail.trim(), name: newName.trim() });
      toast.success("User created");
      setCreateOpen(false);
      fetchItems();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "Failed to create");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (id: string) => {
    try {
      await api.delete(`/users/${id}`);
      toast.success("User deactivated");
      fetchItems();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "Failed to deactivate");
    }
  };

  const handleActivate = async (id: string) => {
    try {
      await api.post(`/users/${id}/activate`, {});
      toast.success("User activated");
      fetchItems();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "Failed to activate");
    }
  };

  const handleSetPassword = async () => {
    if (!pwUser || !newPassword.trim()) return;
    try {
      await api.post(`/users/${pwUser.id}/password`, { password: newPassword });
      toast.success("Password updated");
      setPwOpen(false);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "Failed to set password");
    }
  };

  return (
    <div className="p-4 md:p-6">
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No users</div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-border/30">
                  <td className="py-2 px-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span>{item.name}</span>
                        <span className="text-xs text-muted-foreground">{item.email}</span>
                        {!item.isActive && (
                          <Badge className="bg-red-900/30 text-red-400 border-red-800/50 text-xs py-0">Inactive</Badge>
                        )}
                      </div>
                      <div className="flex gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-xs h-6"
                          onClick={() => { setPwUser(item); setNewPassword(""); setPwOpen(true); }}
                        >
                          Password
                        </Button>
                        {item.isActive ? (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-destructive text-xs h-6"
                            onClick={() => handleDeactivate(item.id)}
                          >
                            Deactivate
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-6"
                            onClick={() => handleActivate(item.id)}
                          >
                            Activate
                          </Button>
                        )}
                      </div>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create User Dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>New User</DialogTitle>
            <DialogDescription>Create a new user account.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="user@example.com" />
            </div>
            <div className="space-y-2">
              <Label>Name</Label>
              <Input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Display name" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button onClick={handleCreate} disabled={saving}>{saving ? "Creating..." : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Set Password Dialog */}
      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Set Password</DialogTitle>
            <DialogDescription>{pwUser?.name} ({pwUser?.email})</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>New Password</Label>
              <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="Min 4 characters" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPwOpen(false)}>Cancel</Button>
            <Button onClick={handleSetPassword}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Fab onClick={() => { setNewEmail(""); setNewName(""); setCreateOpen(true); }} />
    </div>
  );
}
