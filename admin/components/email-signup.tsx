"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ArrowRightIcon, CheckIcon, LoaderIcon } from "lucide-react";
import { subscribeToEarlyAccess, hasSubscribedLocally, type SubscriptionResult } from "@/lib/subscriptions";

export function EmailSignup() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [isSuccess, setIsSuccess] = useState(false);
  const [isAlreadySubscribed, setIsAlreadySubscribed] = useState(false);

  // Check localStorage on component mount
  useEffect(() => {
    const localEmail = hasSubscribedLocally();
    if (localEmail) {
      setEmail(localEmail);
      setIsAlreadySubscribed(true);
      setMessage("You're already subscribed!");
      setIsSuccess(true);
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!email.trim()) {
      setMessage("Please enter your email address");
      setIsSuccess(false);
      return;
    }

    setIsLoading(true);
    setMessage("");

    try {
      const result: SubscriptionResult = await subscribeToEarlyAccess(email);
      
      setMessage(result.message);
      setIsSuccess(result.success);
      
      if (result.success || result.alreadySubscribed) {
        setIsAlreadySubscribed(true);
      }
    } catch {
      setMessage("Something went wrong. Please try again.");
      setIsSuccess(false);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-md mx-auto">
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="flex gap-2 p-2 border rounded-lg bg-background shadow-lg">
          <Input 
            placeholder="Enter your email for early access" 
            className="border-0 shadow-none focus-visible:ring-0"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading || isAlreadySubscribed}
          />
          <Button 
            type="submit"
            disabled={isLoading || isAlreadySubscribed}
            className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700 disabled:opacity-50"
          >
            {isLoading ? (
              <>
                <LoaderIcon className="w-4 h-4 mr-2 animate-spin" />
                Subscribing...
              </>
            ) : isAlreadySubscribed ? (
              <>
                <CheckIcon className="w-4 h-4 mr-2" />
                Subscribed
              </>
            ) : (
              <>
                Notify Me
                <ArrowRightIcon className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>

        {/* Status Message */}
        {message && (
          <div className={`text-sm text-center p-2 rounded-md ${
            isSuccess 
              ? "bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-300" 
              : "bg-red-50 text-red-700 dark:bg-red-900/20 dark:text-red-300"
          }`}>
            {message}
          </div>
        )}

        {/* Subscription Count */}
        <p className="text-xs text-muted-foreground text-center">
          {isAlreadySubscribed 
            ? "Thanks for joining the wait list!" 
            : "Join early users waiting for the productivity revolution"
          }
        </p>
      </form>
    </div>
  );
} 