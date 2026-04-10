"use client";

import { useState, useEffect, useMemo } from 'react';
import OnboardingStepper from './OnboardingStepper';
import OnboardingDashboard from './OnboardingDashboard';
import { motion, AnimatePresence } from 'framer-motion';
import { trackEvent } from "@/lib/analytics/mixpanel";
import { useOrganizationContext } from '@/lib/context/OrganizationContext';

interface Organization {
  id: string;
  name: string;
}

interface OnboardingManagerProps {
  initialOrganization: Organization | null;
}

export default function OnboardingManager({ initialOrganization }: OnboardingManagerProps) {
  const { currentOrganization } = useOrganizationContext();
  const effectiveOrganization: Organization | null = useMemo(() => {
    return currentOrganization
      ? { id: currentOrganization.id, name: currentOrganization.name }
      : initialOrganization;
  }, [currentOrganization, initialOrganization]);

  // If no organization, force wizard mode.
  // If organization exists, default to wizard but allow dashboard.
  const [view, setView] = useState<'wizard' | 'dashboard'>(
    effectiveOrganization ? 'wizard' : 'wizard'
  );

  // Initialize view from localStorage only once on client mount
  useEffect(() => {
    if (effectiveOrganization) {
      const savedSkip = localStorage.getItem('onboarding_skipped');
      if (savedSkip === 'true') {
        setView('dashboard');
      }
    }
  }, [effectiveOrganization]);

  const handleSkip = () => {
    localStorage.setItem('onboarding_skipped', 'true');
    trackEvent("Onboarding Skipped");
    setView('dashboard');
  };

  const handleContinue = () => {
    localStorage.removeItem('onboarding_skipped');
    trackEvent("Onboarding Continued");
    setView('wizard');
  };

  const handleComplete = () => {
    localStorage.setItem('onboarding_skipped', 'true');
    setView('dashboard');
  };

  return (
    <div className="relative min-h-[calc(100vh-4rem)]">
      <AnimatePresence mode="wait">
        {view === 'wizard' ? (
          <motion.div
            key="wizard"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
          >
            <OnboardingStepper 
              initialOrganization={effectiveOrganization} 
              onSkip={effectiveOrganization ? handleSkip : undefined}
              onComplete={handleComplete}
            />
          </motion.div>
        ) : (
          <motion.div
            key="dashboard"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, y: 20 }}
            transition={{ duration: 0.3 }}
          >
            {effectiveOrganization && (
              <OnboardingDashboard 
                organization={effectiveOrganization} 
                onContinueOnboarding={handleContinue} 
              />
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
