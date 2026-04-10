"use client"

import { useState, useId, useEffect } from 'react';
// buttons are provided by the parent modal in Knowledge Base; remove local magical indicator import
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { BrainIcon, PlusIcon, AlertTriangleIcon, CheckCircleIcon, LoaderIcon } from 'lucide-react';
import { trackEvent } from '@/lib/analytics/mixpanel';
import { useOrganizationContext } from '@/lib/context/OrganizationContext';

interface TrainingSession {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed' | 'paused';
  training_type: 'metrics' | 'glossary' | 'gold_sql';
  content: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
  error_message?: string;
}

const trainingTypes = [
  { 
    value: 'glossary', 
    label: 'Glossary', 
    description: 'Business terms, definitions, and domain knowledge',
    icon: '📖'
  },
  { 
    value: 'gold_sql', 
    label: 'Gold SQL Examples', 
    description: 'Natural language questions paired with their corresponding SQL queries',
    icon: '✨'
  },
  { 
    value: 'metrics', 
    label: 'Metrics', 
    description: 'Business metrics, KPIs, and their definitions',
    icon: '📊'
  },
];

type SchemaTrainingProps = {
  forceForm?: boolean;
  onClose?: () => void;
  formId?: string;
  bare?: boolean; // render without Card wrapper/header
  onCreatingChange?: (creating: boolean) => void;
  onSuccess?: () => void; // callback when entry is successfully added
};

export default function SchemaTraining({ forceForm = false, onClose, formId, bare = false, onCreatingChange, onSuccess }: SchemaTrainingProps) {
  const { currentOrganizationId } = useOrganizationContext();
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const nameId = useId();
  const typeId = useId();
  const schemaId = useId();
  const tableId = useId();
  const questionId = useId();
  const sqlId = useId();
  const explanationId = useId();
  const tagsId = useId();
  const dialectId = useId();
  
  // Form state
  const [showCreateForm, setShowCreateForm] = useState(forceForm);
  const [databases, setDatabases] = useState<Array<{id: string; database_name: string; dialect: string}>>([]);
  const [loadingDatabases, setLoadingDatabases] = useState(true);
  const [tables, setTables] = useState<string[]>([]);
  const [loadingTables, setLoadingTables] = useState(false);
  const [formData, setFormData] = useState<{
    database: string;
    training_type: TrainingSession['training_type'];
    table_name: string;
    dialect: 'postgres' | 'clickhouse' | 'mysql';
    // Gold SQL fields
    question?: string;
    sql?: string;
    name?: string;
    description?: string;
    // Glossary fields
    term?: string;
    definition?: string;
    // Additional fields
    schema_name?: string;
    explanation?: string;
    tags?: string[];
  }>({
    database: '',
    training_type: 'gold_sql' as TrainingSession['training_type'],
    table_name: '',
    dialect: 'postgres',
    // Gold SQL
    question: '',
    sql: '',
    name: '',
    description: '',
    // Glossary
    term: '',
    definition: '',
    // Additional fields
    schema_name: '',
    explanation: '',
    tags: [],
  });


  // Fetch databases on mount
  useEffect(() => {
    const fetchDatabases = async () => {
      if (!currentOrganizationId) {
        setDatabases([]);
        setLoadingDatabases(false);
        return;
      }
      try {
        setLoadingDatabases(true);
        setDatabases([]);
        const response = await fetch('/api/databases', {
          headers: { 'x-organization-id': currentOrganizationId },
        });
        if (response.ok) {
          const data = await response.json();
          setDatabases(data.databases || []);
        }
      } catch (error) {
        console.error('Failed to fetch databases:', error);
      } finally {
        setLoadingDatabases(false);
      }
    };
    fetchDatabases();
  }, [currentOrganizationId]);

  // Fetch tables when database changes
  useEffect(() => {
    const fetchTables = async () => {
      if (!formData.database || !currentOrganizationId) {
        setTables([]);
        return;
      }
      try {
        setLoadingTables(true);
        const response = await fetch(`/api/databases/${encodeURIComponent(formData.database)}/tables`, {
          headers: { 'x-organization-id': currentOrganizationId },
        });
        if (response.ok) {
          const data = await response.json();
          setTables(data.tables || []);
        } else {
          setTables([]);
        }
      } catch (error) {
        console.error('Failed to fetch tables:', error);
        setTables([]);
      } finally {
        setLoadingTables(false);
      }
    };
    fetchTables();
  }, [formData.database, currentOrganizationId]);

  // No session listing in this component — only the create form.

  const handleCreateSession = async () => {
    // Validate based on training type
    if (!formData.database.trim() || !formData.table_name.trim()) {
      setError('Database and Table Name are required');
      return;
    }

    if (formData.training_type === 'gold_sql') {
      if (!formData.sql?.trim()) {
        setError('SQL is required for Gold SQL entries');
        return;
      }
    } else if (formData.training_type === 'glossary') {
      if (!formData.term?.trim() || !formData.definition?.trim()) {
        setError('Term and Definition are required for Glossary entries');
        return;
      }
    }

    setIsCreating(true);
    if (onCreatingChange) onCreatingChange(true);
    setError(null);
    setSuccess(null);

    try {
      if (!currentOrganizationId) {
        throw new Error('No workspace selected');
      }
      const payload: {
        database: string;
        training_type: TrainingSession['training_type'];
        table_name: string;
        dialect: string;
        sql?: string;
        name?: string;
        description?: string;
        question?: string;
        term?: string;
        definition?: string;
      } = {
        database: formData.database,
        training_type: formData.training_type,
        table_name: formData.table_name,
        dialect: formData.dialect,
      };

      // Add type-specific fields
      if (formData.training_type === 'gold_sql') {
        payload.sql = formData.sql;
        payload.name = formData.name || formData.question; // Use name if provided, otherwise question
        payload.description = formData.description;
        payload.question = formData.question;
      } else if (formData.training_type === 'glossary') {
        payload.term = formData.term;
        payload.definition = formData.definition;
      }

      const response = await fetch('/api/train', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-organization-id': currentOrganizationId,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData?.error || 'Failed to create training session');
      }

      await response.json();
      
      trackEvent("Training Session Created", {
        organization_id: currentOrganizationId,
        training_type: formData.training_type,
        database: formData.database,
        table_name: formData.table_name,
        dialect: formData.dialect
      });
      
      setShowCreateForm(false);
      // Preserve training type after successful submission
      resetForm(true);
      
      // Create specific success message based on training type
      let successMessage = 'Training completed successfully!';
      if (formData.training_type === 'glossary') {
        successMessage = `Glossary entry "${formData.term}" added successfully!`;
      } else if (formData.training_type === 'gold_sql') {
        const identifier = formData.name || formData.question || 'SQL query';
        successMessage = `Gold SQL example "${identifier}" added successfully!`;
      }
      
      setSuccess(successMessage);
      
      // Notify parent component of successful submission
      if (onSuccess) onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create training session');
    } finally {
      setIsCreating(false);
      if (onCreatingChange) onCreatingChange(false);
    }
  };

  const resetForm = (preserveTrainingType = false) => {
    const currentTrainingType = formData.training_type;
    const currentDatabase = formData.database;
    const currentDialect = formData.dialect;
    
    setFormData({
      database: preserveTrainingType ? currentDatabase : '',
      training_type: preserveTrainingType ? currentTrainingType : ('gold_sql' as TrainingSession['training_type']),
      table_name: '',
      dialect: preserveTrainingType ? currentDialect : 'postgres',
      question: '',
      sql: '',
      name: '',
      description: '',
      term: '',
      definition: '',
      schema_name: '',
      explanation: '',
      tags: [],
    });
  };

  // deleteSession removed: chunk deletion is handled in knowledge base page via /api/chunks

  // getTrainingType not needed in this component

  // Bare form for modal usage (no Card, no header/description)
  if (forceForm && bare) {
    const FormWrapper: 'form' | 'div' = formId ? 'form' : 'div';
    const formProps = formId ? { id: formId, onSubmit: (e: React.FormEvent) => { e.preventDefault(); void handleCreateSession(); } } : {};
    return (
      <div className="space-y-4">
        {/* Error/Success Messages */}
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
        <FormWrapper className="space-y-4" {...formProps}>
          <fieldset disabled={isCreating} className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor={nameId}>Database</Label>
              <div className="relative">
                <select
                  id={nameId}
                  value={formData.database}
                  onChange={(e) => {
                    const selectedDb = databases.find(db => db.database_name === e.target.value);
                    setFormData(prev => ({
                      ...prev,
                      database: e.target.value,
                      dialect: (selectedDb?.dialect || 'postgres') as 'postgres' | 'clickhouse' | 'mysql'
                    }));
                  }}
                  className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
                  disabled={loadingDatabases}
                >
                  <option value="">{loadingDatabases ? 'Loading databases...' : 'Select a database...'}</option>
                  {databases.map(db => (
                    <option key={db.id} value={db.database_name}>
                      {db.database_name} ({db.dialect})
                    </option>
                  ))}
                </select>
                {loadingDatabases && (
                  <div className="absolute right-8 top-1/2 -translate-y-1/2 pointer-events-none">
                    <LoaderIcon className="w-4 h-4 animate-spin text-purple-600" />
                  </div>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor={typeId}>Training Type</Label>
              <select
                id={typeId}
                value={formData.training_type}
                onChange={(e) => setFormData(prev => ({ ...prev, training_type: e.target.value as TrainingSession['training_type'] }))}
                className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
              >
                {trainingTypes.filter(t => t.value === 'gold_sql' || t.value === 'glossary').map(type => (
                  <option key={type.value} value={type.value}>
                    {type.icon} {type.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor={tableId}>Table Name</Label>
              <div className="relative">
                <select
                  id={tableId}
                  value={formData.table_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, table_name: e.target.value }))}
                  className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
                  disabled={loadingTables || !formData.database}
                >
                  <option value="">
                    {!formData.database ? 'Select a database first...' : loadingTables ? 'Loading tables...' : 'Select a table...'}
                  </option>
                  {tables.map(table => (
                    <option key={table} value={table}>
                      {table}
                    </option>
                  ))}
                </select>
                {loadingTables && (
                  <div className="absolute right-8 top-1/2 -translate-y-1/2 pointer-events-none">
                    <LoaderIcon className="w-4 h-4 animate-spin text-purple-600" />
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Gold SQL Fields */}
          {formData.training_type === 'gold_sql' && (
            <>
              <div className="space-y-2">
                <Label htmlFor={questionId}>Question (optional)</Label>
                <Input
                  id={questionId}
                  value={formData.question}
                  onChange={(e) => setFormData(prev => ({ ...prev, question: e.target.value }))}
                  placeholder="Natural language question"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={sqlId}>SQL *</Label>
                <textarea
                  id={sqlId}
                  value={formData.sql}
                  onChange={(e) => setFormData(prev => ({ ...prev, sql: e.target.value }))}
                  placeholder="SELECT * FROM users WHERE..."
                  className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm min-h-[120px] font-mono"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={nameId}>Name (optional)</Label>
                  <Input
                    id={nameId}
                    value={formData.name}
                    onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                    placeholder="e.g., Active Users Count"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={explanationId}>Description (optional)</Label>
                  <Input
                    id={explanationId}
                    value={formData.description}
                    onChange={(e) => setFormData(prev => ({ ...prev, description: e.target.value }))}
                    placeholder="What this query does"
                  />
                </div>
              </div>
            </>
          )}

          {/* Glossary Fields */}
          {formData.training_type === 'glossary' && (
            <>
              <div className="space-y-2">
                <Label htmlFor={questionId}>Term *</Label>
                <Input
                  id={questionId}
                  value={formData.term}
                  onChange={(e) => setFormData(prev => ({ ...prev, term: e.target.value }))}
                  placeholder="e.g., active user"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor={sqlId}>Definition *</Label>
                <textarea
                  id={sqlId}
                  value={formData.definition}
                  onChange={(e) => setFormData(prev => ({ ...prev, definition: e.target.value }))}
                  placeholder="A user who has logged in within the last 30 days"
                  className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm min-h-[120px]"
                />
              </div>
            </>
          )}

          
          </fieldset>
        </FormWrapper>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Error/Success Messages */}
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

      {/* Create New Training Session */}
      {!showCreateForm ? (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <PlusIcon className="w-5 h-5" />
                Create Training Session
              </span>
              <Button onClick={() => setShowCreateForm(true)}>
                <PlusIcon className="w-4 h-4 mr-2" />
                New Session
              </Button>
            </CardTitle>
            <CardDescription>
              Create a new vector model training session
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BrainIcon className="w-5 h-5" />
              Create Training Session
            </CardTitle>
            <CardDescription>
              Provide your training data for vector model generation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <fieldset disabled={isCreating} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor={nameId}>Database</Label>
                <Input
                  id={nameId}
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Database id you used in your SDK"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={typeId}>Training Type</Label>
                <select
                  disabled={true}
                  id={typeId}
                  value={formData.training_type}
                  onChange={(e) => setFormData(prev => ({ ...prev, training_type: e.target.value as TrainingSession['training_type'] }))}
                  className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
                >
                  {trainingTypes.map(type => (
                    <option key={type.value} value={type.value}>
                      {type.icon} {type.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor={dialectId}>Dialect</Label>
                <select
                  id={dialectId}
                  value={formData.dialect}
                  onChange={(e) => setFormData(prev => ({ ...prev, dialect: e.target.value as 'postgres' | 'clickhouse' }))}
                  className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm"
                >
                  <option value="postgres">Postgres</option>
                  <option value="clickhouse">ClickHouse</option>
                </select>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor={schemaId}>Schema Name</Label>
                <Input
                  id={schemaId}
                  value={formData.schema_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, schema_name: e.target.value }))}
                  placeholder="e.g., public"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={tableId}>Table Name</Label>
                <Input
                  id={tableId}
                  value={formData.table_name}
                  onChange={(e) => setFormData(prev => ({ ...prev, table_name: e.target.value }))}
                  placeholder="e.g., users"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor={questionId}>Question</Label>
              <Input
                id={questionId}
                value={formData.question}
                onChange={(e) => setFormData(prev => ({ ...prev, question: e.target.value }))}
                placeholder="Natural language question"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor={sqlId}>SQL</Label>
              <textarea
                id={sqlId}
                value={formData.sql}
                onChange={(e) => setFormData(prev => ({ ...prev, sql: e.target.value }))}
                placeholder="Corresponding SQL statement"
                className="w-full px-3 py-2 border border-input bg-background rounded-md text-sm min-h-[120px]"
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor={explanationId}>Explanation (optional)</Label>
                <Input
                  id={explanationId}
                  value={formData.explanation}
                  onChange={(e) => setFormData(prev => ({ ...prev, explanation: e.target.value }))}
                  placeholder="Short explanation"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor={tagsId}>Tags (comma separated, optional)</Label>
                <Input
                  id={tagsId}
                  value={(formData.tags || []).join(', ')}
                  onChange={(e) => setFormData(prev => ({ ...prev, tags: e.target.value.split(',').map(s => s.trim()).filter(Boolean) }))}
                  placeholder="e.g., sales, customer"
                />
              </div>
            </div>

            </fieldset>
            <div className="flex gap-2">
              <Button
                type="button"
                onClick={handleCreateSession}
                disabled={
                  isCreating ||
                  !formData.name?.trim() ||
                  !formData.question?.trim() ||
                  !formData.sql?.trim() ||
                  !formData.schema_name?.trim() ||
                  !formData.table_name.trim()
                }
              >
                {isCreating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin mr-2" />
                    Creating...
                  </>
                ) : (
                  <>
                    <PlusIcon className="w-4 h-4 mr-2" />
                    Create Session
                  </>
                )}
              </Button>
              <Button 
                type="button"
                variant="outline" 
                onClick={() => {
                  if (forceForm && onClose) {
                    onClose();
                  } else {
                  setShowCreateForm(false);
                  }
                  resetForm();
                }}
                disabled={isCreating}
              >
                Cancel
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Session listing removed — this component only renders the create form. */}
    </div>
  );
}

