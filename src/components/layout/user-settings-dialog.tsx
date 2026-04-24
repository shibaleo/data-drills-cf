"use client";

import { useState, useEffect, useCallback } from "react";
import { HardDrive, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { useMe } from "@/components/auth/auth-gate";
import { ApiError } from "@/lib/api-client";
import { rpc, unwrap } from "@/lib/rpc-client";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function UserSettingsDialog({ open, onOpenChange }: Props) {
  const { me, refresh } = useMe();

  // Name editing
  const [name, setName] = useState(me.name);
  const [nameSaving, setNameSaving] = useState(false);

  // Password
  const [password, setPassword] = useState("");
  const [passwordConfirm, setPasswordConfirm] = useState("");
  const [passwordSaving, setPasswordSaving] = useState(false);

  // Google Drive
  const [driveConnected, setDriveConnected] = useState<boolean | null>(null);
  const [driveLoading, setDriveLoading] = useState(false);

  const fetchDriveStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/auth/google/status");
      if (res.ok) {
        const data = await res.json() as { connected: boolean };
        setDriveConnected(data.connected);
      }
    } catch {
      setDriveConnected(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      setName(me.name);
      setPassword("");
      setPasswordConfirm("");
      fetchDriveStatus();
    }
  }, [open, me.name, fetchDriveStatus]);

  const handleSaveName = async () => {
    if (!name.trim() || name === me.name) return;
    setNameSaving(true);
    try {
      await unwrap(
        rpc.api.v1.users[":id"].$put({
          param: { id: me.id },
          json: { name: name.trim() },
        }),
      );
      await refresh();
      toast.success("Display name updated");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "Failed to update");
    } finally { setNameSaving(false); }
  };

  const handleChangePassword = async () => {
    if (password.length < 4) {
      toast.error("Password must be at least 4 characters");
      return;
    }
    if (password !== passwordConfirm) {
      toast.error("Passwords do not match");
      return;
    }
    setPasswordSaving(true);
    try {
      await unwrap(
        rpc.api.v1.users[":id"].password.$post({
          param: { id: me.id },
          json: { password },
        }),
      );
      setPassword("");
      setPasswordConfirm("");
      toast.success("Password changed");
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "Failed to update");
    } finally { setPasswordSaving(false); }
  };

  const handleDisconnectDrive = async () => {
    setDriveLoading(true);
    try {
      await fetch("/api/auth/google/disconnect", { method: "POST" });
      setDriveConnected(false);
      toast.success("Google Drive disconnected");
    } catch {
      toast.error("Failed to disconnect");
    } finally {
      setDriveLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>User Settings</DialogTitle>
          <DialogDescription className="sr-only">Manage your account settings</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          {/* ── Profile ── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Profile</h3>
            <div className="space-y-1">
              <Label>Email</Label>
              <p className="text-sm text-muted-foreground">{me.email}</p>
            </div>
          </section>

          {/* ── Display Name ── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Display Name</h3>
            <div className="flex gap-2">
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
              <Button
                size="sm"
                onClick={handleSaveName}
                disabled={nameSaving || !name.trim() || name === me.name}
              >
                {nameSaving ? "Saving..." : "Save"}
              </Button>
            </div>
          </section>

          {/* ── Password ── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Change Password</h3>
            <div className="space-y-2">
              <Label htmlFor="settings-pw">New Password</Label>
              <Input
                id="settings-pw"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="settings-pw-confirm">Confirm</Label>
              <Input
                id="settings-pw-confirm"
                type="password"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <Button
              size="sm"
              onClick={handleChangePassword}
              disabled={passwordSaving || password.length < 4}
            >
              {passwordSaving ? "Changing..." : "Change Password"}
            </Button>
          </section>

          {/* ── Google Drive ── */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">Google Drive</h3>
            {driveConnected === null ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" />
                Checking...
              </div>
            ) : driveConnected ? (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm">
                  <HardDrive className="size-4 text-green-400" />
                  Connected
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-destructive"
                  onClick={handleDisconnectDrive}
                  disabled={driveLoading}
                >
                  {driveLoading ? <Loader2 className="size-4 animate-spin" /> : "Disconnect"}
                </Button>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <HardDrive className="size-4" />
                  Not connected
                </div>
                <Button
                  size="sm"
                  onClick={() => { window.location.href = "/api/auth/google"; }}
                >
                  Connect
                </Button>
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
