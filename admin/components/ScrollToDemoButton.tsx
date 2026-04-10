"use client";
import { Button } from "@/components/ui/button";
import { GitBranchIcon } from "lucide-react";

export default function ScrollToDemoButton() {
  const handleClick = () => {
    const el = document.getElementById("demo-video");
    if (el) {
      el.scrollIntoView({ behavior: "smooth" });
    }
  };
  return (
    <Button size="lg" variant="outline" className="border-2" onClick={handleClick}>
      <GitBranchIcon className="w-4 h-4 mr-2" />
      Watch Demo
    </Button>
  );
} 