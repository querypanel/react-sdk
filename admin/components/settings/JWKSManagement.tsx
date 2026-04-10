"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  KeyIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
  DownloadIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  EyeIcon,
  EyeOffIcon,
  CopyIcon,
  Loader2,
} from "lucide-react";
import { trackEvent } from "@/lib/analytics/mixpanel";

interface PublicKey {
  id: string;
  name: string;
  public_key: string;
  private_key_secret_id?: string | null;
  key_type: "rsa" | "ec" | "ed25519";
  key_format?: "PEM" | "JWK";
  description?: string | null;
  created_at: string;
  is_active: boolean;
}

interface JWKSManagementProps {
  orgId: string;
}

function jwksQueryKey(orgId: string) {
  return ["jwks", orgId] as const;
}

async function fetchPublicKeys(orgId: string): Promise<PublicKey[]> {
  const res = await fetch("/api/jwks", {
    credentials: "same-origin",
    headers: { "x-organization-id": orgId },
  });
  const data: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      data &&
      typeof data === "object" &&
      "error" in data &&
      typeof (data as { error: unknown }).error === "string"
        ? (data as { error: string }).error
        : "Failed to fetch public keys";
    throw new Error(msg);
  }
  return Array.isArray(data) ? (data as PublicKey[]) : [];
}

export default function JWKSManagement({ orgId }: JWKSManagementProps) {
  const queryClient = useQueryClient();
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [showUploadForm, setShowUploadForm] = useState(false);
  const [showGenerateForm, setShowGenerateForm] = useState(false);
  const [generatedKeys, setGeneratedKeys] = useState<{
    publicKey: string;
    privateKey: string;
  } | null>(null);
  const [formData, setFormData] = useState({
    name: "",
    public_key: "",
    private_key: "",
    description: "",
  });

  const {
    data: keys = [],
    isPending,
    isError,
    error: queryError,
    refetch,
  } = useQuery({
    queryKey: jwksQueryKey(orgId),
    queryFn: () => fetchPublicKeys(orgId),
    enabled: Boolean(orgId),
  });

  const invalidateKeys = () =>
    queryClient.invalidateQueries({ queryKey: jwksQueryKey(orgId) });

  const loadError =
    isError && queryError instanceof Error ? queryError.message : null;

  const handleUploadKey = async () => {
    if (!formData.name.trim() || !formData.public_key.trim()) {
      setError("Name and public key are required");
      return;
    }

    setIsUploading(true);
    setError(null);
    setSuccess(null);

    try {
      const keyType = detectKeyType(formData.public_key);

      const response = await fetch("/api/jwks/upload", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-organization-id": orgId,
        },
        body: JSON.stringify({
          name: formData.name,
          public_key: formData.public_key,
          private_key: formData.private_key || null,
          description: formData.description || null,
          key_type: keyType,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to upload public key");
      }

      trackEvent("JWKS Key Uploaded", {
        key_name: formData.name,
        key_type: keyType,
      });
      await invalidateKeys();
      setShowUploadForm(false);
      resetForm();
      setSuccess("Public key uploaded successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload public key");
    } finally {
      setIsUploading(false);
    }
  };

  const detectKeyType = (publicKey: string): "rsa" | "ec" | "ed25519" => {
    if (publicKey.includes("BEGIN RSA PUBLIC KEY")) {
      return "rsa";
    }
    if (publicKey.includes("BEGIN EC PUBLIC KEY")) {
      return "ec";
    }
    if (
      publicKey.includes("BEGIN PUBLIC KEY") &&
      publicKey.includes("Ed25519")
    ) {
      return "ed25519";
    }
    if (publicKey.includes("BEGIN PUBLIC KEY")) {
      return "rsa";
    }
    return "rsa";
  };

  const resetForm = () => {
    setFormData({
      name: "",
      public_key: "",
      private_key: "",
      description: "",
    });
    setGeneratedKeys(null);
  };

  const generateKeyPair = async () => {
    try {
      setError(null);
      const keyPair = await window.crypto.subtle.generateKey(
        {
          name: "RSASSA-PKCS1-v1_5",
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: "SHA-256",
        },
        true,
        ["sign", "verify"],
      );

      const privateKeyBuffer = await window.crypto.subtle.exportKey(
        "pkcs8",
        keyPair.privateKey,
      );
      const publicKeyBuffer = await window.crypto.subtle.exportKey(
        "spki",
        keyPair.publicKey,
      );

      const privateKeyPem = arrayBufferToPEM(privateKeyBuffer, "PRIVATE KEY");
      const publicKeyPem = arrayBufferToPEM(publicKeyBuffer, "PUBLIC KEY");

      setGeneratedKeys({
        privateKey: privateKeyPem,
        publicKey: publicKeyPem,
      });

      setFormData((prev) => ({
        ...prev,
        public_key: publicKeyPem,
        private_key: privateKeyPem,
      }));

      trackEvent("JWKS Key Pair Generated", { key_type: "RSA" });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate key pair");
    }
  };

  const arrayBufferToPEM = (buffer: ArrayBuffer, label: string): string => {
    const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)));
    const pem = `-----BEGIN ${label}-----\n${base64.match(/.{1,64}/g)?.join("\n")}\n-----END ${label}-----`;
    return pem;
  };

  const toggleKeyStatus = async (keyId: string, currentStatus: boolean) => {
    try {
      setError(null);
      const response = await fetch(`/api/jwks/${keyId}/toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_active: !currentStatus }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to update key status");
      }

      trackEvent("JWKS Key Status Changed", {
        key_id: keyId,
        new_status: !currentStatus ? "active" : "inactive",
      });
      await invalidateKeys();
      setSuccess(`Key ${!currentStatus ? "activated" : "deactivated"} successfully`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update key status");
    }
  };

  const deleteKey = async (keyId: string) => {
    if (
      !confirm(
        "Are you sure you want to delete this public key? This action cannot be undone.",
      )
    ) {
      return;
    }

    try {
      setError(null);
      const response = await fetch(`/api/jwks/${keyId}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to delete public key");
      }

      trackEvent("JWKS Key Deleted", { key_id: keyId });
      await invalidateKeys();
      setSuccess("Public key deleted successfully");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete public key");
    }
  };

  const copyToClipboard = (text: string, keyName?: string) => {
    navigator.clipboard.writeText(text);
    trackEvent("JWKS Key Copied", { key_name: keyName });
    setSuccess("Copied to clipboard");
  };

  const downloadKey = (key: PublicKey) => {
    trackEvent("JWKS Key Downloaded", {
      key_name: key.name,
      key_type: key.key_type,
    });
    const blob = new Blob([key.public_key], { type: "text/plain" });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${key.name}-public-key.pem`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
  };

  if (isPending) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-muted-foreground/25 py-20 text-muted-foreground">
        <Loader2 className="h-8 w-8 animate-spin" />
        <p className="text-sm">Loading keys…</p>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-900 bg-red-50/50 dark:bg-red-950/20 p-6 text-center space-y-4">
        <p className="text-sm text-red-600 dark:text-red-400">
          {loadError ?? "Failed to load public keys"}
        </p>
        <Button type="button" variant="outline" onClick={() => void refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="p-3 rounded-lg bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2">
            <AlertTriangleIcon className="w-4 h-4 text-red-600 dark:text-red-400" />
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          </div>
        </div>
      )}

      {success && (
        <div className="p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
          <div className="flex items-center gap-2">
            <CheckCircleIcon className="w-4 h-4 text-green-600 dark:text-green-400" />
            <p className="text-sm text-green-600 dark:text-green-400">{success}</p>
          </div>
        </div>
      )}

      {!showUploadForm && !showGenerateForm ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-center gap-2">
                <KeyIcon className="w-5 h-5" />
                Add Key Pair
              </span>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
                <Button
                  variant="outline"
                  onClick={() => {
                    trackEvent("JWKS Generate Form Opened", {
                      location: "settings_jwks_tab",
                    });
                    setShowGenerateForm(true);
                  }}
                >
                  <PlusIcon className="w-4 h-4 mr-2" />
                  Generate New
                </Button>
                <Button
                  onClick={() => {
                    trackEvent("JWKS Upload Form Opened", {
                      location: "settings_jwks_tab",
                    });
                    setShowUploadForm(true);
                  }}
                >
                  <UploadIcon className="w-4 h-4 mr-2" />
                  Upload Existing
                </Button>
              </div>
            </CardTitle>
            <CardDescription>
              Generate a new key pair or upload an existing public key
            </CardDescription>
          </CardHeader>
        </Card>
      ) : showGenerateForm ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyIcon className="w-5 h-5" />
              Generate Key Pair
            </CardTitle>
            <CardDescription>
              Generate a new RSA-2048 key pair for QueryPanel SDK integration
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="gen-key-name">Key Name</Label>
              <Input
                id="gen-key-name"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g., Production SDK Key"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gen-description">Description (Optional)</Label>
              <Input
                id="gen-description"
                value={formData.description}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    description: e.target.value,
                  }))
                }
                placeholder="e.g., Used for dashboard chart generation"
              />
            </div>

            {!generatedKeys && (
              <Button onClick={generateKeyPair} className="w-full">
                <KeyIcon className="w-4 h-4 mr-2" />
                Generate Key Pair
              </Button>
            )}

            {generatedKeys && (
              <>
                <div className="space-y-2">
                  <Label className="text-xs font-medium text-green-600 dark:text-green-400">
                    ✓ Key Pair Generated
                  </Label>
                  <div className="space-y-3 border border-green-200 dark:border-green-800 rounded-lg p-4 bg-green-50 dark:bg-green-950/20">
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">
                        Public Key
                      </Label>
                      <div className="bg-muted p-2 rounded text-xs max-h-24 overflow-y-auto mt-1">
                        <pre className="whitespace-pre-wrap">
                          {generatedKeys.publicKey}
                        </pre>
                      </div>
                    </div>
                    <div>
                      <Label className="text-xs font-medium text-muted-foreground">
                        Private Key
                      </Label>
                      <div className="bg-muted p-2 rounded text-xs max-h-24 overflow-y-auto mt-1">
                        <pre className="whitespace-pre-wrap">
                          {generatedKeys.privateKey}
                        </pre>
                      </div>
                      <p className="text-xs text-orange-600 dark:text-orange-400 mt-2">
                        ⚠️ Save the private key securely! It will be encrypted and
                        stored in the database.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2 sm:flex-row">
                  <Button
                    onClick={handleUploadKey}
                    disabled={isUploading || !formData.name.trim()}
                  >
                    {isUploading ? (
                      <>
                        <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <CheckCircleIcon className="w-4 h-4 mr-2" />
                        Save Key Pair
                      </>
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    onClick={() => {
                      setShowGenerateForm(false);
                      resetForm();
                    }}
                    disabled={isUploading}
                  >
                    Cancel
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <KeyIcon className="w-5 h-5" />
              Upload Public Key
            </CardTitle>
            <CardDescription>
              Provide your public key in PEM format
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="key-name">Key Name</Label>
              <Input
                id="key-name"
                value={formData.name}
                onChange={(e) =>
                  setFormData((prev) => ({ ...prev, name: e.target.value }))
                }
                placeholder="e.g., My Production Key"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="public-key">Public Key (PEM Format)</Label>
              <textarea
                id="public-key"
                value={formData.public_key}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    public_key: e.target.value,
                  }))
                }
                placeholder="-----BEGIN PUBLIC KEY-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA...\n-----END PUBLIC KEY-----"
                className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm min-h-[200px] font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Paste your public key in PEM format. Supports RSA, EC, and Ed25519
                keys.
              </p>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <Button
                onClick={handleUploadKey}
                disabled={
                  isUploading ||
                  !formData.name.trim() ||
                  !formData.public_key.trim()
                }
              >
                {isUploading ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Uploading...
                  </>
                ) : (
                  <>
                    <UploadIcon className="w-4 h-4 mr-2" />
                    Upload Key
                  </>
                )}
              </Button>
              <Button
                variant="outline"
                onClick={() => {
                  setShowUploadForm(false);
                  resetForm();
                }}
                disabled={isUploading}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <KeyIcon className="w-5 h-5" />
            Public Keys
          </CardTitle>
          <CardDescription>Manage your uploaded public keys</CardDescription>
        </CardHeader>
        <CardContent>
          {keys.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <KeyIcon className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No public keys uploaded yet</p>
              <p className="text-sm">Upload your first public key to get started</p>
            </div>
          ) : (
            <div className="space-y-4">
              {keys.map((key) => (
                <div key={key.id} className="border rounded-lg p-4 space-y-4">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-blue-100 dark:bg-blue-900/20 flex items-center justify-center">
                        <KeyIcon className="w-5 h-5 text-blue-600 dark:text-blue-400" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="truncate font-medium">{key.name}</h4>
                        <p className="text-sm text-muted-foreground">
                          {key.key_type.toUpperCase()} •{" "}
                          {new Date(key.created_at).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col gap-2 sm:items-end">
                      <Badge variant={key.is_active ? "default" : "secondary"}>
                        {key.is_active ? "Active" : "Inactive"}
                      </Badge>
                      <div className="flex flex-wrap gap-1">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => toggleKeyStatus(key.id, key.is_active)}
                        >
                          {key.is_active ? (
                            <EyeOffIcon className="w-4 h-4" />
                          ) : (
                            <EyeIcon className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            copyToClipboard(key.public_key, key.name)
                          }
                        >
                          <CopyIcon className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => downloadKey(key)}
                        >
                          <DownloadIcon className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => deleteKey(key.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2Icon className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label className="text-xs font-medium text-muted-foreground">
                      Public Key
                    </Label>
                    <div className="bg-muted p-3 rounded-md text-sm max-h-32 overflow-y-auto">
                      <pre className="whitespace-pre-wrap text-xs">
                        {key.public_key}
                      </pre>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
