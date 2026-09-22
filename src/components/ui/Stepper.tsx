import React from 'react';
import { Check, AlertCircle } from 'lucide-react';

interface Step {
  id: string;
  label: string;
  description?: string;
  status: 'completed' | 'current' | 'pending' | 'error';
}

interface StepperProps {
  steps: Step[];
  orientation?: 'horizontal' | 'vertical';
}

export default function Stepper({ steps, orientation = 'horizontal' }: StepperProps) {
  if (orientation === 'vertical') {
    return (
      <div className="flex flex-col">
        {steps.map((step, i) => (
          <div key={`vstep-${step.id}`} className="flex gap-3">
            {/* Line + dot column */}
            <div className="flex flex-col items-center">
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 border-2 text-xs font-bold
                ${step.status === 'completed' ? 'bg-accent border-accent text-white' : ''}
                ${step.status === 'current' ? 'bg-primary border-primary text-white' : ''}
                ${step.status === 'pending' ? 'bg-card border-border text-muted-foreground' : ''}
                ${step.status === 'error' ? 'bg-red-50 border-red-500 text-red-600' : ''}`}>
                {step.status === 'completed' ? <Check size={12} /> : step.status === 'error' ? <AlertCircle size={12} /> : i + 1}
              </div>
              {i < steps.length - 1 && (
                <div className={`w-0.5 flex-1 my-1 min-h-[20px] ${step.status === 'completed' ? 'bg-accent' : 'bg-border'}`} />
              )}
            </div>
            {/* Content */}
            <div className="pb-5">
              <p className={`text-sm font-semibold leading-none mb-0.5 ${step.status === 'current' ? 'text-primary' : step.status === 'completed' ? 'text-foreground' : 'text-muted-foreground'}`}>
                {step.label}
              </p>
              {step.description && <p className="text-xs text-muted-foreground">{step.description}</p>}
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex items-start w-full overflow-x-auto">
      {steps.map((step, i) => (
        <React.Fragment key={`hstep-${step.id}`}>
          <div className="flex flex-col items-center min-w-[80px] flex-1">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center border-2 text-xs font-bold mb-1.5
              ${step.status === 'completed' ? 'bg-accent border-accent text-white' : ''}
              ${step.status === 'current' ? 'bg-primary border-primary text-white' : ''}
              ${step.status === 'pending' ? 'bg-card border-border text-muted-foreground' : ''}
              ${step.status === 'error' ? 'bg-red-50 border-red-500 text-red-600' : ''}`}>
              {step.status === 'completed' ? <Check size={12} /> : step.status === 'error' ? <AlertCircle size={12} /> : i + 1}
            </div>
            <p className={`text-xs font-medium text-center leading-tight
              ${step.status === 'current' ? 'text-primary' : step.status === 'completed' ? 'text-foreground' : 'text-muted-foreground'}`}>
              {step.label}
            </p>
          </div>
          {i < steps.length - 1 && (
            <div className={`flex-1 h-0.5 mt-4 ${step.status === 'completed' ? 'bg-accent' : 'bg-border'}`} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}