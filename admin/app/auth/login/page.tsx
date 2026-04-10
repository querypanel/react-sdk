import { LoginForm } from "@/components/login-form";
import Image from "next/image";
import favicon from "@/app/favicon.svg";

export default function Page() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30 flex flex-col">
      {/* Main Content */}
      <div className="flex-1 flex items-center justify-center p-6 md:p-10">
        <div className="w-full max-w-md">
          {/* Header */}
          <div className="text-center">
            <div className="flex justify-center">
              <div className="w-16 h-16 flex items-center justify-center border-2 border-purple-500/30 dark:border-purple-400/30 rounded-xl">
                <Image src={favicon} alt="QueryPanel" width={32} height={32} />
              </div>
            </div>
          </div>

          {/* Form */}
          <LoginForm />
        </div>
      </div>
    </div>
  );
}
