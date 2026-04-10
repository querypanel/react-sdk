"use client";

import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/lib/supabase/client";
import { trackEvent } from "@/lib/analytics/mixpanel";
import { Loader2, CheckCircle2, Sparkles, Building2, Mail, User, MessageSquare } from "lucide-react";

interface ContactSalesDialogProps {
    children: React.ReactNode;
    className?: string;
}

export function ContactSalesDialog({ children, className }: ContactSalesDialogProps) {
    const [open, setOpen] = useState(false);
    const [loading, setLoading] = useState(false);
    const [success, setSuccess] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [formData, setFormData] = useState({
        name: "",
        email: "",
        org_name: "",
        description: ""
    });

    const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
        const { name, value } = e.target;
        setFormData(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setLoading(true);
        setError(null);

        try {
            const supabase = createClient();

            const { error: insertError } = await supabase
                .from('leads')
                .insert([
                    {
                        name: formData.name,
                        email: formData.email,
                        org_name: formData.org_name || null,
                        description: formData.description || null,
                        source: 'contact_sales_modal',
                        created_at: new Date().toISOString()
                    }
                ]);

            if (insertError) throw insertError;

            trackEvent("Contact Sales Submitted", {
                email: formData.email,
                org_name: formData.org_name
            });

            setSuccess(true);
            setTimeout(() => {
                setOpen(false);
                setSuccess(false);
                setFormData({ name: "", email: "", org_name: "", description: "" });
            }, 4000);

        } catch (err) {
            console.error('Error submitting lead:', err);
            setError("Something went wrong. Please try again.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild className={className}>
                {children}
            </DialogTrigger>
            <DialogContent className="sm:max-w-[500px] p-0 overflow-hidden border-0 shadow-2xl">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-blue-500 via-purple-500 to-pink-500" />

                {success ? (
                    <div className="flex flex-col items-center justify-center p-12 text-center space-y-6 bg-gradient-to-br from-background to-muted/30">
                        <div className="relative">
                            <div className="absolute inset-0 bg-green-500/20 blur-xl rounded-full" />
                            <div className="relative rounded-full bg-gradient-to-br from-green-100 to-green-50 dark:from-green-900/30 dark:to-green-800/20 p-4 border border-green-200 dark:border-green-800">
                                <CheckCircle2 className="h-12 w-12 text-green-600 dark:text-green-500 animate-in zoom-in duration-300" />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <DialogTitle className="text-2xl font-bold bg-gradient-to-br from-foreground to-muted-foreground bg-clip-text text-transparent">
                                Message Sent!
                            </DialogTitle>
                            <DialogDescription className="text-base">
                                Thanks for reaching out. Our team will get back to you shortly to discuss how QueryPanel can help your business.
                            </DialogDescription>
                        </div>
                    </div>
                ) : (
                    <div className="flex flex-col">
                        <div className="p-6 pb-2 bg-gradient-to-br from-background to-muted/20">
                            <DialogHeader>
                                <div className="flex items-center gap-2 mb-2">
                                    <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
                                        <Sparkles className="w-5 h-5" />
                                    </div>
                                    <span className="text-sm font-medium text-blue-600 dark:text-blue-400">Let&apos;s talk</span>
                                </div>
                                <DialogTitle className="text-2xl">Contact Sales</DialogTitle>
                                <DialogDescription className="text-base mt-2">
                                    Tell us about your needs and we&apos;ll help you find the perfect plan.
                                </DialogDescription>
                            </DialogHeader>
                        </div>

                        <form onSubmit={handleSubmit} className="p-6 space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                        <User className="w-3.5 h-3.5" /> Name <span className="text-red-500">*</span>
                                    </Label>
                                    <Input
                                        id="name"
                                        name="name"
                                        placeholder="John Doe"
                                        required
                                        className="bg-muted/30 border-muted-foreground/20 focus:border-blue-500 transition-colors"
                                        value={formData.name}
                                        onChange={handleChange}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="org_name" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                        <Building2 className="w-3.5 h-3.5" /> Company
                                    </Label>
                                    <Input
                                        id="org_name"
                                        name="org_name"
                                        placeholder="Acme Inc."
                                        className="bg-muted/30 border-muted-foreground/20 focus:border-blue-500 transition-colors"
                                        value={formData.org_name}
                                        onChange={handleChange}
                                    />
                                </div>
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="email" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                    <Mail className="w-3.5 h-3.5" /> Work Email <span className="text-red-500">*</span>
                                </Label>
                                <Input
                                    id="email"
                                    name="email"
                                    type="email"
                                    placeholder="john@company.com"
                                    required
                                    className="bg-muted/30 border-muted-foreground/20 focus:border-blue-500 transition-colors"
                                    value={formData.email}
                                    onChange={handleChange}
                                />
                            </div>

                            <div className="space-y-2">
                                <Label htmlFor="description" className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                                    <MessageSquare className="w-3.5 h-3.5" /> How can we help?
                                </Label>
                                <Textarea
                                    id="description"
                                    name="description"
                                    placeholder="Tell us about your use case, expected volume, or any specific requirements..."
                                    className="min-h-[100px] bg-muted/30 border-muted-foreground/20 focus:border-blue-500 transition-colors resize-none"
                                    value={formData.description}
                                    onChange={handleChange}
                                />
                            </div>

                            {error && (
                                <div className="p-3 text-sm text-red-600 bg-red-50 dark:bg-red-900/10 rounded-md text-center border border-red-200 dark:border-red-900/20">
                                    {error}
                                </div>
                            )}

                            <div className="pt-2">
                                <Button
                                    type="submit"
                                    disabled={loading}
                                    className="w-full bg-gradient-to-r from-blue-600 via-purple-600 to-purple-700 hover:from-blue-700 hover:via-purple-700 hover:to-purple-800 text-white font-medium h-11"
                                >
                                    {loading ? (
                                        <>
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            Sending Request...
                                        </>
                                    ) : (
                                        "Submit Request"
                                    )}
                                </Button>
                                <p className="text-[10px] text-center text-muted-foreground mt-3">
                                    We typically respond within 24 hours.
                                </p>
                            </div>
                        </form>
                    </div>
                )}
            </DialogContent>
        </Dialog>
    );
}
