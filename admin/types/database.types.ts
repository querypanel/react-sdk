export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "12.2.12 (cd3cf9e)"
  }
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      audit_logs: {
        Row: {
          action: string
          created_at: string | null
          details: Json | null
          error_message: string | null
          id: string
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string | null
          details?: Json | null
          error_message?: string | null
          id?: string
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string | null
          details?: Json | null
          error_message?: string | null
          id?: string
          user_id?: string | null
        }
        Relationships: []
      }
      customer_dashboard_blocks: {
        Row: {
          block_type: string
          content: Json
          created_at: string | null
          created_by: string | null
          dashboard_id: string
          id: string
          order_index: number
          shared_with_tenant: boolean | null
          tenant_id: string
          updated_at: string | null
        }
        Insert: {
          block_type: string
          content: Json
          created_at?: string | null
          created_by?: string | null
          dashboard_id: string
          id?: string
          order_index: number
          shared_with_tenant?: boolean | null
          tenant_id: string
          updated_at?: string | null
        }
        Update: {
          block_type?: string
          content?: Json
          created_at?: string | null
          created_by?: string | null
          dashboard_id?: string
          id?: string
          order_index?: number
          shared_with_tenant?: boolean | null
          tenant_id?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_dashboard_blocks_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "dashboards"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_subscriptions: {
        Row: {
          created_at: string | null
          end_date: string | null
          id: number
          org_id: string | null
          plan_id: number | null
          start_date: string | null
          status: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          end_date?: string | null
          id?: number
          org_id?: string | null
          plan_id?: number | null
          start_date?: string | null
          status?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          end_date?: string | null
          id?: number
          org_id?: string | null
          plan_id?: number | null
          start_date?: string | null
          status?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_subscriptions_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboard_blocks: {
        Row: {
          block_type: string
          content: Json
          created_at: string | null
          dashboard_id: string
          id: string
          order_index: number
          updated_at: string | null
        }
        Insert: {
          block_type: string
          content: Json
          created_at?: string | null
          dashboard_id: string
          id?: string
          order_index: number
          updated_at?: string | null
        }
        Update: {
          block_type?: string
          content?: Json
          created_at?: string | null
          dashboard_id?: string
          id?: string
          order_index?: number
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboard_blocks_dashboard_id_fkey"
            columns: ["dashboard_id"]
            isOneToOne: false
            referencedRelation: "dashboards"
            referencedColumns: ["id"]
          },
        ]
      }
      dashboards: {
        Row: {
          available_datasource_ids: string[] | null
          content_json: string | null
          created_at: string | null
          created_by: string | null
          dashboard_type: string
          datasource_id: string | null
          deployed_at: string | null
          description: string | null
          editor_type: string | null
          forked_from_dashboard_id: string | null
          id: string
          is_customer_fork: boolean | null
          name: string
          organization_id: string
          status: string
          tenant_field_by_datasource: Json | null
          tenant_field_name: string | null
          tenant_id: string | null
          updated_at: string | null
          version: number | null
          widget_config: Json | null
        }
        Insert: {
          available_datasource_ids?: string[] | null
          content_json?: string | null
          created_at?: string | null
          created_by?: string | null
          dashboard_type?: string
          datasource_id?: string | null
          deployed_at?: string | null
          description?: string | null
          editor_type?: string | null
          forked_from_dashboard_id?: string | null
          id?: string
          is_customer_fork?: boolean | null
          name: string
          organization_id: string
          status?: string
          tenant_field_by_datasource?: Json | null
          tenant_field_name?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          version?: number | null
          widget_config?: Json | null
        }
        Update: {
          available_datasource_ids?: string[] | null
          content_json?: string | null
          created_at?: string | null
          created_by?: string | null
          dashboard_type?: string
          datasource_id?: string | null
          deployed_at?: string | null
          description?: string | null
          editor_type?: string | null
          forked_from_dashboard_id?: string | null
          id?: string
          is_customer_fork?: boolean | null
          name?: string
          organization_id?: string
          status?: string
          tenant_field_by_datasource?: Json | null
          tenant_field_name?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          version?: number | null
          widget_config?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "dashboards_datasource_id_fkey"
            columns: ["datasource_id"]
            isOneToOne: false
            referencedRelation: "datasources"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboards_forked_from_dashboard_id_fkey"
            columns: ["forked_from_dashboard_id"]
            isOneToOne: false
            referencedRelation: "dashboards"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dashboards_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      databases_v4: {
        Row: {
          chunk_count: number | null
          created_at: string
          database_name: string
          description: string | null
          dialect: string
          id: string
          ingestion_type: string | null
          last_ingested_at: string
          organization_id: string
          row_count: number | null
          schema_export: Json
          schema_hash: string
          table_count: number | null
          tenant_field_name: string | null
          updated_at: string
        }
        Insert: {
          chunk_count?: number | null
          created_at?: string
          database_name: string
          description?: string | null
          dialect: string
          id?: string
          ingestion_type?: string | null
          last_ingested_at?: string
          organization_id: string
          row_count?: number | null
          schema_export: Json
          schema_hash: string
          table_count?: number | null
          tenant_field_name?: string | null
          updated_at?: string
        }
        Update: {
          chunk_count?: number | null
          created_at?: string
          database_name?: string
          description?: string | null
          dialect?: string
          id?: string
          ingestion_type?: string | null
          last_ingested_at?: string
          organization_id?: string
          row_count?: number | null
          schema_export?: Json
          schema_hash?: string
          table_count?: number | null
          tenant_field_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      datasources: {
        Row: {
          aws_region: string | null
          aws_role_arn: string | null
          bigquery_dataset_project_id: string | null
          bigquery_location: string | null
          bigquery_meta: Json | null
          bigquery_project_id: string | null
          created_at: string
          created_by: string | null
          credentials_secret_id: string | null
          database_name: string
          dialect: string
          host: string | null
          id: string
          name: string
          organization_id: string
          password_secret_id: string | null
          port: number | null
          ssl_mode: string | null
          tenant_field_name: string | null
          tenant_field_type: string | null
          updated_at: string
          use_iam_auth: boolean | null
          username: string | null
        }
        Insert: {
          aws_region?: string | null
          aws_role_arn?: string | null
          bigquery_dataset_project_id?: string | null
          bigquery_location?: string | null
          bigquery_meta?: Json | null
          bigquery_project_id?: string | null
          created_at?: string
          created_by?: string | null
          credentials_secret_id?: string | null
          database_name: string
          dialect: string
          host?: string | null
          id?: string
          name: string
          organization_id: string
          password_secret_id?: string | null
          port?: number | null
          ssl_mode?: string | null
          tenant_field_name?: string | null
          tenant_field_type?: string | null
          updated_at?: string
          use_iam_auth?: boolean | null
          username?: string | null
        }
        Update: {
          aws_region?: string | null
          aws_role_arn?: string | null
          bigquery_dataset_project_id?: string | null
          bigquery_location?: string | null
          bigquery_meta?: Json | null
          bigquery_project_id?: string | null
          created_at?: string
          created_by?: string | null
          credentials_secret_id?: string | null
          database_name?: string
          dialect?: string
          host?: string | null
          id?: string
          name?: string
          organization_id?: string
          password_secret_id?: string | null
          port?: number | null
          ssl_mode?: string | null
          tenant_field_name?: string | null
          tenant_field_type?: string | null
          updated_at?: string
          use_iam_auth?: boolean | null
          username?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "datasources_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          created_at: string
          description: string | null
          email: string
          id: string
          name: string
          org_name: string | null
          source: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          email: string
          id?: string
          name: string
          org_name?: string | null
          source?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          email?: string
          id?: string
          name?: string
          org_name?: string | null
          source?: string | null
        }
        Relationships: []
      }
      mastra_agent_versions: {
        Row: {
          agentId: string
          agents: Json | null
          changedFields: Json | null
          changeMessage: string | null
          createdAt: string
          createdAtZ: string | null
          defaultOptions: Json | null
          description: string | null
          id: string
          inputProcessors: Json | null
          instructions: string
          integrationTools: Json | null
          mcpClients: Json | null
          memory: Json | null
          model: Json
          name: string
          outputProcessors: Json | null
          requestContextSchema: Json | null
          scorers: Json | null
          skills: Json | null
          skillsFormat: string | null
          tools: Json | null
          versionNumber: number
          workflows: Json | null
          workspace: Json | null
        }
        Insert: {
          agentId: string
          agents?: Json | null
          changedFields?: Json | null
          changeMessage?: string | null
          createdAt: string
          createdAtZ?: string | null
          defaultOptions?: Json | null
          description?: string | null
          id: string
          inputProcessors?: Json | null
          instructions: string
          integrationTools?: Json | null
          mcpClients?: Json | null
          memory?: Json | null
          model: Json
          name: string
          outputProcessors?: Json | null
          requestContextSchema?: Json | null
          scorers?: Json | null
          skills?: Json | null
          skillsFormat?: string | null
          tools?: Json | null
          versionNumber: number
          workflows?: Json | null
          workspace?: Json | null
        }
        Update: {
          agentId?: string
          agents?: Json | null
          changedFields?: Json | null
          changeMessage?: string | null
          createdAt?: string
          createdAtZ?: string | null
          defaultOptions?: Json | null
          description?: string | null
          id?: string
          inputProcessors?: Json | null
          instructions?: string
          integrationTools?: Json | null
          mcpClients?: Json | null
          memory?: Json | null
          model?: Json
          name?: string
          outputProcessors?: Json | null
          requestContextSchema?: Json | null
          scorers?: Json | null
          skills?: Json | null
          skillsFormat?: string | null
          tools?: Json | null
          versionNumber?: number
          workflows?: Json | null
          workspace?: Json | null
        }
        Relationships: []
      }
      mastra_agents: {
        Row: {
          activeVersionId: string | null
          authorId: string | null
          createdAt: string
          createdAtZ: string | null
          id: string
          metadata: Json | null
          status: string
          updatedAt: string
          updatedAtZ: string | null
        }
        Insert: {
          activeVersionId?: string | null
          authorId?: string | null
          createdAt: string
          createdAtZ?: string | null
          id: string
          metadata?: Json | null
          status: string
          updatedAt: string
          updatedAtZ?: string | null
        }
        Update: {
          activeVersionId?: string | null
          authorId?: string | null
          createdAt?: string
          createdAtZ?: string | null
          id?: string
          metadata?: Json | null
          status?: string
          updatedAt?: string
          updatedAtZ?: string | null
        }
        Relationships: []
      }
      mastra_ai_spans: {
        Row: {
          attributes: Json | null
          createdAt: string
          createdAtZ: string | null
          endedAt: string | null
          endedAtZ: string | null
          entityId: string | null
          entityName: string | null
          entityType: string | null
          environment: string | null
          error: Json | null
          experimentId: string | null
          input: Json | null
          isEvent: boolean
          links: Json | null
          metadata: Json | null
          name: string
          organizationId: string | null
          output: Json | null
          parentEntityId: string | null
          parentEntityName: string | null
          parentEntityType: string | null
          parentSpanId: string | null
          requestContext: Json | null
          requestId: string | null
          resourceId: string | null
          rootEntityId: string | null
          rootEntityName: string | null
          rootEntityType: string | null
          runId: string | null
          scope: Json | null
          serviceName: string | null
          sessionId: string | null
          source: string | null
          spanId: string
          spanType: string
          startedAt: string
          startedAtZ: string | null
          tags: Json | null
          threadId: string | null
          traceId: string
          updatedAt: string | null
          updatedAtZ: string | null
          userId: string | null
        }
        Insert: {
          attributes?: Json | null
          createdAt: string
          createdAtZ?: string | null
          endedAt?: string | null
          endedAtZ?: string | null
          entityId?: string | null
          entityName?: string | null
          entityType?: string | null
          environment?: string | null
          error?: Json | null
          experimentId?: string | null
          input?: Json | null
          isEvent: boolean
          links?: Json | null
          metadata?: Json | null
          name: string
          organizationId?: string | null
          output?: Json | null
          parentEntityId?: string | null
          parentEntityName?: string | null
          parentEntityType?: string | null
          parentSpanId?: string | null
          requestContext?: Json | null
          requestId?: string | null
          resourceId?: string | null
          rootEntityId?: string | null
          rootEntityName?: string | null
          rootEntityType?: string | null
          runId?: string | null
          scope?: Json | null
          serviceName?: string | null
          sessionId?: string | null
          source?: string | null
          spanId: string
          spanType: string
          startedAt: string
          startedAtZ?: string | null
          tags?: Json | null
          threadId?: string | null
          traceId: string
          updatedAt?: string | null
          updatedAtZ?: string | null
          userId?: string | null
        }
        Update: {
          attributes?: Json | null
          createdAt?: string
          createdAtZ?: string | null
          endedAt?: string | null
          endedAtZ?: string | null
          entityId?: string | null
          entityName?: string | null
          entityType?: string | null
          environment?: string | null
          error?: Json | null
          experimentId?: string | null
          input?: Json | null
          isEvent?: boolean
          links?: Json | null
          metadata?: Json | null
          name?: string
          organizationId?: string | null
          output?: Json | null
          parentEntityId?: string | null
          parentEntityName?: string | null
          parentEntityType?: string | null
          parentSpanId?: string | null
          requestContext?: Json | null
          requestId?: string | null
          resourceId?: string | null
          rootEntityId?: string | null
          rootEntityName?: string | null
          rootEntityType?: string | null
          runId?: string | null
          scope?: Json | null
          serviceName?: string | null
          sessionId?: string | null
          source?: string | null
          spanId?: string
          spanType?: string
          startedAt?: string
          startedAtZ?: string | null
          tags?: Json | null
          threadId?: string | null
          traceId?: string
          updatedAt?: string | null
          updatedAtZ?: string | null
          userId?: string | null
        }
        Relationships: []
      }
      mastra_dataset_items: {
        Row: {
          createdAt: string
          createdAtZ: string | null
          datasetId: string
          datasetVersion: number
          groundTruth: Json | null
          id: string
          input: Json
          isDeleted: boolean
          metadata: Json | null
          requestContext: Json | null
          source: Json | null
          updatedAt: string
          updatedAtZ: string | null
          validTo: number | null
        }
        Insert: {
          createdAt: string
          createdAtZ?: string | null
          datasetId: string
          datasetVersion: number
          groundTruth?: Json | null
          id: string
          input: Json
          isDeleted: boolean
          metadata?: Json | null
          requestContext?: Json | null
          source?: Json | null
          updatedAt: string
          updatedAtZ?: string | null
          validTo?: number | null
        }
        Update: {
          createdAt?: string
          createdAtZ?: string | null
          datasetId?: string
          datasetVersion?: number
          groundTruth?: Json | null
          id?: string
          input?: Json
          isDeleted?: boolean
          metadata?: Json | null
          requestContext?: Json | null
          source?: Json | null
          updatedAt?: string
          updatedAtZ?: string | null
          validTo?: number | null
        }
        Relationships: []
      }
      mastra_dataset_versions: {
        Row: {
          createdAt: string
          createdAtZ: string | null
          datasetId: string
          id: string
          version: number
        }
        Insert: {
          createdAt: string
          createdAtZ?: string | null
          datasetId: string
          id: string
          version: number
        }
        Update: {
          createdAt?: string
          createdAtZ?: string | null
          datasetId?: string
          id?: string
          version?: number
        }
        Relationships: []
      }
      mastra_datasets: {
        Row: {
          createdAt: string
          createdAtZ: string | null
          description: string | null
          groundTruthSchema: Json | null
          id: string
          inputSchema: Json | null
          metadata: Json | null
          name: string
          requestContextSchema: Json | null
          tags: Json | null
          targetIds: Json | null
          targetType: string | null
          updatedAt: string
          updatedAtZ: string | null
          version: number
        }
        Insert: {
          createdAt: string
          createdAtZ?: string | null
          description?: string | null
          groundTruthSchema?: Json | null
          id: string
          inputSchema?: Json | null
          metadata?: Json | null
          name: string
          requestContextSchema?: Json | null
          tags?: Json | null
          targetIds?: Json | null
          targetType?: string | null
          updatedAt: string
          updatedAtZ?: string | null
          version: number
        }
        Update: {
          createdAt?: string
          createdAtZ?: string | null
          description?: string | null
          groundTruthSchema?: Json | null
          id?: string
          inputSchema?: Json | null
          metadata?: Json | null
          name?: string
          requestContextSchema?: Json | null
          tags?: Json | null
          targetIds?: Json | null
          targetType?: string | null
          updatedAt?: string
          updatedAtZ?: string | null
          version?: number
        }
        Relationships: []
      }
      mastra_experiment_results: {
        Row: {
          completedAt: string
          completedAtZ: string | null
          createdAt: string
          createdAtZ: string | null
          error: Json | null
          experimentId: string
          groundTruth: Json | null
          id: string
          input: Json
          itemDatasetVersion: number | null
          itemId: string
          output: Json | null
          retryCount: number
          startedAt: string
          startedAtZ: string | null
          traceId: string | null
        }
        Insert: {
          completedAt: string
          completedAtZ?: string | null
          createdAt: string
          createdAtZ?: string | null
          error?: Json | null
          experimentId: string
          groundTruth?: Json | null
          id: string
          input: Json
          itemDatasetVersion?: number | null
          itemId: string
          output?: Json | null
          retryCount: number
          startedAt: string
          startedAtZ?: string | null
          traceId?: string | null
        }
        Update: {
          completedAt?: string
          completedAtZ?: string | null
          createdAt?: string
          createdAtZ?: string | null
          error?: Json | null
          experimentId?: string
          groundTruth?: Json | null
          id?: string
          input?: Json
          itemDatasetVersion?: number | null
          itemId?: string
          output?: Json | null
          retryCount?: number
          startedAt?: string
          startedAtZ?: string | null
          traceId?: string | null
        }
        Relationships: []
      }
      mastra_experiments: {
        Row: {
          completedAt: string | null
          completedAtZ: string | null
          createdAt: string
          createdAtZ: string | null
          datasetId: string | null
          datasetVersion: number | null
          description: string | null
          failedCount: number
          id: string
          metadata: Json | null
          name: string | null
          skippedCount: number
          startedAt: string | null
          startedAtZ: string | null
          status: string
          succeededCount: number
          targetId: string
          targetType: string
          totalItems: number
          updatedAt: string
          updatedAtZ: string | null
        }
        Insert: {
          completedAt?: string | null
          completedAtZ?: string | null
          createdAt: string
          createdAtZ?: string | null
          datasetId?: string | null
          datasetVersion?: number | null
          description?: string | null
          failedCount: number
          id: string
          metadata?: Json | null
          name?: string | null
          skippedCount: number
          startedAt?: string | null
          startedAtZ?: string | null
          status: string
          succeededCount: number
          targetId: string
          targetType: string
          totalItems: number
          updatedAt: string
          updatedAtZ?: string | null
        }
        Update: {
          completedAt?: string | null
          completedAtZ?: string | null
          createdAt?: string
          createdAtZ?: string | null
          datasetId?: string | null
          datasetVersion?: number | null
          description?: string | null
          failedCount?: number
          id?: string
          metadata?: Json | null
          name?: string | null
          skippedCount?: number
          startedAt?: string | null
          startedAtZ?: string | null
          status?: string
          succeededCount?: number
          targetId?: string
          targetType?: string
          totalItems?: number
          updatedAt?: string
          updatedAtZ?: string | null
        }
        Relationships: []
      }
      mastra_mcp_client_versions: {
        Row: {
          changedFields: Json | null
          changeMessage: string | null
          createdAt: string
          createdAtZ: string | null
          description: string | null
          id: string
          mcpClientId: string
          name: string
          servers: Json
          versionNumber: number
        }
        Insert: {
          changedFields?: Json | null
          changeMessage?: string | null
          createdAt: string
          createdAtZ?: string | null
          description?: string | null
          id: string
          mcpClientId: string
          name: string
          servers: Json
          versionNumber: number
        }
        Update: {
          changedFields?: Json | null
          changeMessage?: string | null
          createdAt?: string
          createdAtZ?: string | null
          description?: string | null
          id?: string
          mcpClientId?: string
          name?: string
          servers?: Json
          versionNumber?: number
        }
        Relationships: []
      }
      mastra_mcp_clients: {
        Row: {
          activeVersionId: string | null
          authorId: string | null
          createdAt: string
          createdAtZ: string | null
          id: string
          metadata: Json | null
          status: string
          updatedAt: string
          updatedAtZ: string | null
        }
        Insert: {
          activeVersionId?: string | null
          authorId?: string | null
          createdAt: string
          createdAtZ?: string | null
          id: string
          metadata?: Json | null
          status: string
          updatedAt: string
          updatedAtZ?: string | null
        }
        Update: {
          activeVersionId?: string | null
          authorId?: string | null
          createdAt?: string
          createdAtZ?: string | null
          id?: string
          metadata?: Json | null
          status?: string
          updatedAt?: string
          updatedAtZ?: string | null
        }
        Relationships: []
      }
      mastra_mcp_server_versions: {
        Row: {
          agents: Json | null
          changedFields: Json | null
          changeMessage: string | null
          createdAt: string
          createdAtZ: string | null
          description: string | null
          id: string
          instructions: string | null
          isLatest: boolean | null
          mcpServerId: string
          name: string
          packageCanonical: string | null
          releaseDate: string | null
          repository: Json | null
          tools: Json | null
          version: string
          versionNumber: number
          workflows: Json | null
        }
        Insert: {
          agents?: Json | null
          changedFields?: Json | null
          changeMessage?: string | null
          createdAt: string
          createdAtZ?: string | null
          description?: string | null
          id: string
          instructions?: string | null
          isLatest?: boolean | null
          mcpServerId: string
          name: string
          packageCanonical?: string | null
          releaseDate?: string | null
          repository?: Json | null
          tools?: Json | null
          version: string
          versionNumber: number
          workflows?: Json | null
        }
        Update: {
          agents?: Json | null
          changedFields?: Json | null
          changeMessage?: string | null
          createdAt?: string
          createdAtZ?: string | null
          description?: string | null
          id?: string
          instructions?: string | null
          isLatest?: boolean | null
          mcpServerId?: string
          name?: string
          packageCanonical?: string | null
          releaseDate?: string | null
          repository?: Json | null
          tools?: Json | null
          version?: string
          versionNumber?: number
          workflows?: Json | null
        }
        Relationships: []
      }
      mastra_mcp_servers: {
        Row: {
          activeVersionId: string | null
          authorId: string | null
          createdAt: string
          createdAtZ: string | null
          id: string
          metadata: Json | null
          status: string
          updatedAt: string
          updatedAtZ: string | null
        }
        Insert: {
          activeVersionId?: string | null
          authorId?: string | null
          createdAt: string
          createdAtZ?: string | null
          id: string
          metadata?: Json | null
          status: string
          updatedAt: string
          updatedAtZ?: string | null
        }
        Update: {
          activeVersionId?: string | null
          authorId?: string | null
          createdAt?: string
          createdAtZ?: string | null
          id?: string
          metadata?: Json | null
          status?: string
          updatedAt?: string
          updatedAtZ?: string | null
        }
        Relationships: []
      }
      mastra_messages: {
        Row: {
          content: string
          createdAt: string
          createdAtZ: string | null
          id: string
          resourceId: string | null
          role: string
          thread_id: string
          type: string
        }
        Insert: {
          content: string
          createdAt: string
          createdAtZ?: string | null
          id: string
          resourceId?: string | null
          role: string
          thread_id: string
          type: string
        }
        Update: {
          content?: string
          createdAt?: string
          createdAtZ?: string | null
          id?: string
          resourceId?: string | null
          role?: string
          thread_id?: string
          type?: string
        }
        Relationships: []
      }
      mastra_observational_memory: {
        Row: {
          activeObservations: string
          activeObservationsPendingUpdate: string | null
          bufferedMessageIds: Json | null
          bufferedObservationChunks: Json | null
          bufferedObservations: string | null
          bufferedObservationTokens: number | null
          bufferedReflection: string | null
          bufferedReflectionInputTokens: number | null
          bufferedReflectionTokens: number | null
          config: string
          createdAt: string
          createdAtZ: string | null
          generationCount: number
          id: string
          isBufferingObservation: boolean
          isBufferingReflection: boolean
          isObserving: boolean
          isReflecting: boolean
          lastBufferedAtTime: string | null
          lastBufferedAtTimeZ: string | null
          lastBufferedAtTokens: number
          lastObservedAt: string | null
          lastObservedAtZ: string | null
          lastReflectionAt: string | null
          lastReflectionAtZ: string | null
          lookupKey: string
          metadata: Json | null
          observationTokenCount: number
          observedMessageIds: Json | null
          observedTimezone: string | null
          originType: string
          pendingMessageTokens: number
          reflectedObservationLineCount: number | null
          resourceId: string | null
          scope: string
          threadId: string | null
          totalTokensObserved: number
          updatedAt: string
          updatedAtZ: string | null
        }
        Insert: {
          activeObservations: string
          activeObservationsPendingUpdate?: string | null
          bufferedMessageIds?: Json | null
          bufferedObservationChunks?: Json | null
          bufferedObservations?: string | null
          bufferedObservationTokens?: number | null
          bufferedReflection?: string | null
          bufferedReflectionInputTokens?: number | null
          bufferedReflectionTokens?: number | null
          config: string
          createdAt: string
          createdAtZ?: string | null
          generationCount: number
          id: string
          isBufferingObservation: boolean
          isBufferingReflection: boolean
          isObserving: boolean
          isReflecting: boolean
          lastBufferedAtTime?: string | null
          lastBufferedAtTimeZ?: string | null
          lastBufferedAtTokens: number
          lastObservedAt?: string | null
          lastObservedAtZ?: string | null
          lastReflectionAt?: string | null
          lastReflectionAtZ?: string | null
          lookupKey: string
          metadata?: Json | null
          observationTokenCount: number
          observedMessageIds?: Json | null
          observedTimezone?: string | null
          originType: string
          pendingMessageTokens: number
          reflectedObservationLineCount?: number | null
          resourceId?: string | null
          scope: string
          threadId?: string | null
          totalTokensObserved: number
          updatedAt: string
          updatedAtZ?: string | null
        }
        Update: {
          activeObservations?: string
          activeObservationsPendingUpdate?: string | null
          bufferedMessageIds?: Json | null
          bufferedObservationChunks?: Json | null
          bufferedObservations?: string | null
          bufferedObservationTokens?: number | null
          bufferedReflection?: string | null
          bufferedReflectionInputTokens?: number | null
          bufferedReflectionTokens?: number | null
          config?: string
          createdAt?: string
          createdAtZ?: string | null
          generationCount?: number
          id?: string
          isBufferingObservation?: boolean
          isBufferingReflection?: boolean
          isObserving?: boolean
          isReflecting?: boolean
          lastBufferedAtTime?: string | null
          lastBufferedAtTimeZ?: string | null
          lastBufferedAtTokens?: number
          lastObservedAt?: string | null
          lastObservedAtZ?: string | null
          lastReflectionAt?: string | null
          lastReflectionAtZ?: string | null
          lookupKey?: string
          metadata?: Json | null
          observationTokenCount?: number
          observedMessageIds?: Json | null
          observedTimezone?: string | null
          originType?: string
          pendingMessageTokens?: number
          reflectedObservationLineCount?: number | null
          resourceId?: string | null
          scope?: string
          threadId?: string | null
          totalTokensObserved?: number
          updatedAt?: string
          updatedAtZ?: string | null
        }
        Relationships: []
      }
      mastra_prompt_block_versions: {
        Row: {
          blockId: string
          changedFields: Json | null
          changeMessage: string | null
          content: string
          createdAt: string
          createdAtZ: string | null
          description: string | null
          id: string
          name: string
          requestContextSchema: Json | null
          rules: Json | null
          versionNumber: number
        }
        Insert: {
          blockId: string
          changedFields?: Json | null
          changeMessage?: string | null
          content: string
          createdAt: string
          createdAtZ?: string | null
          description?: string | null
          id: string
          name: string
          requestContextSchema?: Json | null
          rules?: Json | null
          versionNumber: number
        }
        Update: {
          blockId?: string
          changedFields?: Json | null
          changeMessage?: string | null
          content?: string
          createdAt?: string
          createdAtZ?: string | null
          description?: string | null
          id?: string
          name?: string
          requestContextSchema?: Json | null
          rules?: Json | null
          versionNumber?: number
        }
        Relationships: []
      }
      mastra_prompt_blocks: {
        Row: {
          activeVersionId: string | null
          authorId: string | null
          createdAt: string
          createdAtZ: string | null
          id: string
          metadata: Json | null
          status: string
          updatedAt: string
          updatedAtZ: string | null
        }
        Insert: {
          activeVersionId?: string | null
          authorId?: string | null
          createdAt: string
          createdAtZ?: string | null
          id: string
          metadata?: Json | null
          status: string
          updatedAt: string
          updatedAtZ?: string | null
        }
        Update: {
          activeVersionId?: string | null
          authorId?: string | null
          createdAt?: string
          createdAtZ?: string | null
          id?: string
          metadata?: Json | null
          status?: string
          updatedAt?: string
          updatedAtZ?: string | null
        }
        Relationships: []
      }
      mastra_resources: {
        Row: {
          createdAt: string
          createdAtZ: string | null
          id: string
          metadata: Json | null
          updatedAt: string
          updatedAtZ: string | null
          workingMemory: string | null
        }
        Insert: {
          createdAt: string
          createdAtZ?: string | null
          id: string
          metadata?: Json | null
          updatedAt: string
          updatedAtZ?: string | null
          workingMemory?: string | null
        }
        Update: {
          createdAt?: string
          createdAtZ?: string | null
          id?: string
          metadata?: Json | null
          updatedAt?: string
          updatedAtZ?: string | null
          workingMemory?: string | null
        }
        Relationships: []
      }
      mastra_scorer_definition_versions: {
        Row: {
          changedFields: Json | null
          changeMessage: string | null
          createdAt: string
          createdAtZ: string | null
          defaultSampling: Json | null
          description: string | null
          id: string
          instructions: string | null
          model: Json | null
          name: string
          presetConfig: Json | null
          scoreRange: Json | null
          scorerDefinitionId: string
          type: string
          versionNumber: number
        }
        Insert: {
          changedFields?: Json | null
          changeMessage?: string | null
          createdAt: string
          createdAtZ?: string | null
          defaultSampling?: Json | null
          description?: string | null
          id: string
          instructions?: string | null
          model?: Json | null
          name: string
          presetConfig?: Json | null
          scoreRange?: Json | null
          scorerDefinitionId: string
          type: string
          versionNumber: number
        }
        Update: {
          changedFields?: Json | null
          changeMessage?: string | null
          createdAt?: string
          createdAtZ?: string | null
          defaultSampling?: Json | null
          description?: string | null
          id?: string
          instructions?: string | null
          model?: Json | null
          name?: string
          presetConfig?: Json | null
          scoreRange?: Json | null
          scorerDefinitionId?: string
          type?: string
          versionNumber?: number
        }
        Relationships: []
      }
      mastra_scorer_definitions: {
        Row: {
          activeVersionId: string | null
          authorId: string | null
          createdAt: string
          createdAtZ: string | null
          id: string
          metadata: Json | null
          status: string
          updatedAt: string
          updatedAtZ: string | null
        }
        Insert: {
          activeVersionId?: string | null
          authorId?: string | null
          createdAt: string
          createdAtZ?: string | null
          id: string
          metadata?: Json | null
          status: string
          updatedAt: string
          updatedAtZ?: string | null
        }
        Update: {
          activeVersionId?: string | null
          authorId?: string | null
          createdAt?: string
          createdAtZ?: string | null
          id?: string
          metadata?: Json | null
          status?: string
          updatedAt?: string
          updatedAtZ?: string | null
        }
        Relationships: []
      }
      mastra_scorers: {
        Row: {
          additionalContext: Json | null
          analyzePrompt: string | null
          analyzeStepResult: Json | null
          createdAt: string
          createdAtZ: string | null
          entity: Json | null
          entityId: string | null
          entityType: string | null
          extractPrompt: string | null
          extractStepResult: Json | null
          generateReasonPrompt: string | null
          generateScorePrompt: string | null
          id: string
          input: Json
          metadata: Json | null
          output: Json
          preprocessPrompt: string | null
          preprocessStepResult: Json | null
          reason: string | null
          reasonPrompt: string | null
          requestContext: Json | null
          resourceId: string | null
          runId: string
          score: number
          scorer: Json
          scorerId: string
          source: string
          spanId: string | null
          threadId: string | null
          traceId: string | null
          updatedAt: string
          updatedAtZ: string | null
        }
        Insert: {
          additionalContext?: Json | null
          analyzePrompt?: string | null
          analyzeStepResult?: Json | null
          createdAt: string
          createdAtZ?: string | null
          entity?: Json | null
          entityId?: string | null
          entityType?: string | null
          extractPrompt?: string | null
          extractStepResult?: Json | null
          generateReasonPrompt?: string | null
          generateScorePrompt?: string | null
          id: string
          input: Json
          metadata?: Json | null
          output: Json
          preprocessPrompt?: string | null
          preprocessStepResult?: Json | null
          reason?: string | null
          reasonPrompt?: string | null
          requestContext?: Json | null
          resourceId?: string | null
          runId: string
          score: number
          scorer: Json
          scorerId: string
          source: string
          spanId?: string | null
          threadId?: string | null
          traceId?: string | null
          updatedAt: string
          updatedAtZ?: string | null
        }
        Update: {
          additionalContext?: Json | null
          analyzePrompt?: string | null
          analyzeStepResult?: Json | null
          createdAt?: string
          createdAtZ?: string | null
          entity?: Json | null
          entityId?: string | null
          entityType?: string | null
          extractPrompt?: string | null
          extractStepResult?: Json | null
          generateReasonPrompt?: string | null
          generateScorePrompt?: string | null
          id?: string
          input?: Json
          metadata?: Json | null
          output?: Json
          preprocessPrompt?: string | null
          preprocessStepResult?: Json | null
          reason?: string | null
          reasonPrompt?: string | null
          requestContext?: Json | null
          resourceId?: string | null
          runId?: string
          score?: number
          scorer?: Json
          scorerId?: string
          source?: string
          spanId?: string | null
          threadId?: string | null
          traceId?: string | null
          updatedAt?: string
          updatedAtZ?: string | null
        }
        Relationships: []
      }
      mastra_skill_blobs: {
        Row: {
          content: string
          createdAt: string
          createdAtZ: string | null
          hash: string
          mimeType: string | null
          size: number
        }
        Insert: {
          content: string
          createdAt: string
          createdAtZ?: string | null
          hash: string
          mimeType?: string | null
          size: number
        }
        Update: {
          content?: string
          createdAt?: string
          createdAtZ?: string | null
          hash?: string
          mimeType?: string | null
          size?: number
        }
        Relationships: []
      }
      mastra_skill_versions: {
        Row: {
          assets: Json | null
          changedFields: Json | null
          changeMessage: string | null
          compatibility: Json | null
          createdAt: string
          createdAtZ: string | null
          description: string
          id: string
          instructions: string
          license: string | null
          metadata: Json | null
          name: string
          references: Json | null
          scripts: Json | null
          skillId: string
          source: Json | null
          tree: Json | null
          versionNumber: number
        }
        Insert: {
          assets?: Json | null
          changedFields?: Json | null
          changeMessage?: string | null
          compatibility?: Json | null
          createdAt: string
          createdAtZ?: string | null
          description: string
          id: string
          instructions: string
          license?: string | null
          metadata?: Json | null
          name: string
          references?: Json | null
          scripts?: Json | null
          skillId: string
          source?: Json | null
          tree?: Json | null
          versionNumber: number
        }
        Update: {
          assets?: Json | null
          changedFields?: Json | null
          changeMessage?: string | null
          compatibility?: Json | null
          createdAt?: string
          createdAtZ?: string | null
          description?: string
          id?: string
          instructions?: string
          license?: string | null
          metadata?: Json | null
          name?: string
          references?: Json | null
          scripts?: Json | null
          skillId?: string
          source?: Json | null
          tree?: Json | null
          versionNumber?: number
        }
        Relationships: []
      }
      mastra_skills: {
        Row: {
          activeVersionId: string | null
          authorId: string | null
          createdAt: string
          createdAtZ: string | null
          id: string
          status: string
          updatedAt: string
          updatedAtZ: string | null
        }
        Insert: {
          activeVersionId?: string | null
          authorId?: string | null
          createdAt: string
          createdAtZ?: string | null
          id: string
          status: string
          updatedAt: string
          updatedAtZ?: string | null
        }
        Update: {
          activeVersionId?: string | null
          authorId?: string | null
          createdAt?: string
          createdAtZ?: string | null
          id?: string
          status?: string
          updatedAt?: string
          updatedAtZ?: string | null
        }
        Relationships: []
      }
      mastra_threads: {
        Row: {
          createdAt: string
          createdAtZ: string | null
          id: string
          metadata: Json | null
          resourceId: string
          title: string
          updatedAt: string
          updatedAtZ: string | null
        }
        Insert: {
          createdAt: string
          createdAtZ?: string | null
          id: string
          metadata?: Json | null
          resourceId: string
          title: string
          updatedAt: string
          updatedAtZ?: string | null
        }
        Update: {
          createdAt?: string
          createdAtZ?: string | null
          id?: string
          metadata?: Json | null
          resourceId?: string
          title?: string
          updatedAt?: string
          updatedAtZ?: string | null
        }
        Relationships: []
      }
      mastra_workflow_snapshot: {
        Row: {
          createdAt: string
          createdAtZ: string | null
          resourceId: string | null
          run_id: string
          snapshot: Json
          updatedAt: string
          updatedAtZ: string | null
          workflow_name: string
        }
        Insert: {
          createdAt: string
          createdAtZ?: string | null
          resourceId?: string | null
          run_id: string
          snapshot: Json
          updatedAt: string
          updatedAtZ?: string | null
          workflow_name: string
        }
        Update: {
          createdAt?: string
          createdAtZ?: string | null
          resourceId?: string | null
          run_id?: string
          snapshot?: Json
          updatedAt?: string
          updatedAtZ?: string | null
          workflow_name?: string
        }
        Relationships: []
      }
      mastra_workspace_versions: {
        Row: {
          autoSync: boolean | null
          changedFields: Json | null
          changeMessage: string | null
          createdAt: string
          createdAtZ: string | null
          description: string | null
          filesystem: Json | null
          id: string
          mounts: Json | null
          name: string
          operationTimeout: number | null
          sandbox: Json | null
          search: Json | null
          skills: Json | null
          tools: Json | null
          versionNumber: number
          workspaceId: string
        }
        Insert: {
          autoSync?: boolean | null
          changedFields?: Json | null
          changeMessage?: string | null
          createdAt: string
          createdAtZ?: string | null
          description?: string | null
          filesystem?: Json | null
          id: string
          mounts?: Json | null
          name: string
          operationTimeout?: number | null
          sandbox?: Json | null
          search?: Json | null
          skills?: Json | null
          tools?: Json | null
          versionNumber: number
          workspaceId: string
        }
        Update: {
          autoSync?: boolean | null
          changedFields?: Json | null
          changeMessage?: string | null
          createdAt?: string
          createdAtZ?: string | null
          description?: string | null
          filesystem?: Json | null
          id?: string
          mounts?: Json | null
          name?: string
          operationTimeout?: number | null
          sandbox?: Json | null
          search?: Json | null
          skills?: Json | null
          tools?: Json | null
          versionNumber?: number
          workspaceId?: string
        }
        Relationships: []
      }
      mastra_workspaces: {
        Row: {
          activeVersionId: string | null
          authorId: string | null
          createdAt: string
          createdAtZ: string | null
          id: string
          metadata: Json | null
          status: string
          updatedAt: string
          updatedAtZ: string | null
        }
        Insert: {
          activeVersionId?: string | null
          authorId?: string | null
          createdAt: string
          createdAtZ?: string | null
          id: string
          metadata?: Json | null
          status: string
          updatedAt: string
          updatedAtZ?: string | null
        }
        Update: {
          activeVersionId?: string | null
          authorId?: string | null
          createdAt?: string
          createdAtZ?: string | null
          id?: string
          metadata?: Json | null
          status?: string
          updatedAt?: string
          updatedAtZ?: string | null
        }
        Relationships: []
      }
      netflix_shows: {
        Row: {
          cast_members: string | null
          country: string | null
          date_added: string | null
          description: string | null
          director: string | null
          duration: string | null
          listed_in: string | null
          rating: string | null
          release_year: number | null
          show_id: string
          tenant_id: string | null
          title: string | null
          type: string | null
        }
        Insert: {
          cast_members?: string | null
          country?: string | null
          date_added?: string | null
          description?: string | null
          director?: string | null
          duration?: string | null
          listed_in?: string | null
          rating?: string | null
          release_year?: number | null
          show_id: string
          tenant_id?: string | null
          title?: string | null
          type?: string | null
        }
        Update: {
          cast_members?: string | null
          country?: string | null
          date_added?: string | null
          description?: string | null
          director?: string | null
          duration?: string | null
          listed_in?: string | null
          rating?: string | null
          release_year?: number | null
          show_id?: string
          tenant_id?: string | null
          title?: string | null
          type?: string | null
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          id: number
          invited_at: string | null
          invited_by: string | null
          joined_at: string | null
          organization_id: string | null
          role: string
          user_id: string | null
        }
        Insert: {
          id?: number
          invited_at?: string | null
          invited_by?: string | null
          joined_at?: string | null
          organization_id?: string | null
          role?: string
          user_id?: string | null
        }
        Update: {
          id?: number
          invited_at?: string | null
          invited_by?: string | null
          joined_at?: string | null
          organization_id?: string | null
          role?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string | null
          id: string
          name: string
          owner_id: string | null
          plan_id: number | null
        }
        Insert: {
          created_at?: string | null
          id?: string
          name: string
          owner_id?: string | null
          plan_id?: number | null
        }
        Update: {
          created_at?: string | null
          id?: string
          name?: string
          owner_id?: string | null
          plan_id?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "organizations_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          features: Json | null
          id: number
          name: string
          price_cents: number
          query_limit: number
          type: string
        }
        Insert: {
          features?: Json | null
          id?: number
          name: string
          price_cents?: number
          query_limit: number
          type?: string
        }
        Update: {
          features?: Json | null
          id?: number
          name?: string
          price_cents?: number
          query_limit?: number
          type?: string
        }
        Relationships: []
      }
      public_keys: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          is_active: boolean | null
          key_format: string | null
          key_type: string
          name: string
          organization_id: string
          private_key_secret_id: string | null
          public_key: string
          updated_at: string | null
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          key_format?: string | null
          key_type: string
          name: string
          organization_id: string
          private_key_secret_id?: string | null
          public_key: string
          updated_at?: string | null
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          is_active?: boolean | null
          key_format?: string | null
          key_type?: string
          name?: string
          organization_id?: string
          private_key_secret_id?: string | null
          public_key?: string
          updated_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "public_keys_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      query_session_turns: {
        Row: {
          created_at: string
          error: string | null
          fields: string[] | null
          id: string
          modification_type: string | null
          params: Json | null
          question: string
          rationale: string | null
          row_count: number | null
          session_id: string
          sql: string | null
          turn_index: number
        }
        Insert: {
          created_at?: string
          error?: string | null
          fields?: string[] | null
          id?: string
          modification_type?: string | null
          params?: Json | null
          question: string
          rationale?: string | null
          row_count?: number | null
          session_id: string
          sql?: string | null
          turn_index: number
        }
        Update: {
          created_at?: string
          error?: string | null
          fields?: string[] | null
          id?: string
          modification_type?: string | null
          params?: Json | null
          question?: string
          rationale?: string | null
          row_count?: number | null
          session_id?: string
          sql?: string | null
          turn_index?: number
        }
        Relationships: [
          {
            foreignKeyName: "query_session_turns_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "query_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      query_sessions: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          session_id: string
          tenant_id: string | null
          title: string | null
          updated_at: string
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          session_id: string
          tenant_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          session_id?: string
          tenant_id?: string | null
          title?: string | null
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "query_sessions_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_annotations: {
        Row: {
          content: string
          created_at: string
          created_by: string
          id: string
          organization_id: string
          target_identifier: string
          updated_at: string
          updated_by: string
        }
        Insert: {
          content: string
          created_at?: string
          created_by: string
          id?: string
          organization_id: string
          target_identifier: string
          updated_at?: string
          updated_by: string
        }
        Update: {
          content?: string
          created_at?: string
          created_by?: string
          id?: string
          organization_id?: string
          target_identifier?: string
          updated_at?: string
          updated_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "schema_annotations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      schema_chunks: {
        Row: {
          content: string | null
          embedding: string | null
          fts: unknown
          id: number
          metadata: Json | null
        }
        Insert: {
          content?: string | null
          embedding?: string | null
          fts?: unknown
          id?: number
          metadata?: Json | null
        }
        Update: {
          content?: string | null
          embedding?: string | null
          fts?: unknown
          id?: number
          metadata?: Json | null
        }
        Relationships: []
      }
      schema_chunks_v4: {
        Row: {
          content: string
          embedding: string | null
          id: string
          metadata: Json
        }
        Insert: {
          content: string
          embedding?: string | null
          id: string
          metadata: Json
        }
        Update: {
          content?: string
          embedding?: string | null
          id?: string
          metadata?: Json
        }
        Relationships: []
      }
      schema_sync_state: {
        Row: {
          created_at: string
          database_name: string
          introspected_at: string
          organization_id: string
          schema_hash: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          database_name: string
          introspected_at: string
          organization_id: string
          schema_hash: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          database_name?: string
          introspected_at?: string
          organization_id?: string
          schema_hash?: string
          updated_at?: string
        }
        Relationships: []
      }
      sdk_active_charts: {
        Row: {
          chart_id: string
          created_at: string | null
          id: string
          meta: Json | null
          order: number | null
          organization_id: string | null
          tenant_id: string | null
          updated_at: string | null
          user_id: string | null
        }
        Insert: {
          chart_id: string
          created_at?: string | null
          id?: string
          meta?: Json | null
          order?: number | null
          organization_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Update: {
          chart_id?: string
          created_at?: string | null
          id?: string
          meta?: Json | null
          order?: number | null
          organization_id?: string | null
          tenant_id?: string | null
          updated_at?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sdk_active_charts_chart_id_fkey"
            columns: ["chart_id"]
            isOneToOne: false
            referencedRelation: "sdk_charts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sdk_active_charts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sdk_charts: {
        Row: {
          created_at: string | null
          description: string | null
          id: string
          organization_id: string | null
          prompt: string | null
          query_id: string | null
          sql: string
          sql_params: Json | null
          target_db: string | null
          tenant_id: string | null
          title: string
          updated_at: string | null
          user_id: string | null
          vega_lite_spec: Json
        }
        Insert: {
          created_at?: string | null
          description?: string | null
          id?: string
          organization_id?: string | null
          prompt?: string | null
          query_id?: string | null
          sql: string
          sql_params?: Json | null
          target_db?: string | null
          tenant_id?: string | null
          title: string
          updated_at?: string | null
          user_id?: string | null
          vega_lite_spec: Json
        }
        Update: {
          created_at?: string | null
          description?: string | null
          id?: string
          organization_id?: string | null
          prompt?: string | null
          query_id?: string | null
          sql?: string
          sql_params?: Json | null
          target_db?: string | null
          tenant_id?: string | null
          title?: string
          updated_at?: string | null
          user_id?: string | null
          vega_lite_spec?: Json
        }
        Relationships: [
          {
            foreignKeyName: "sdk_charts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sdk_usage: {
        Row: {
          created_at: string
          id: number
          metadata: Json | null
          model: string | null
          org_id: string | null
          prompt: string | null
          tenant_id: string | null
          used_tokens: number | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: number
          metadata?: Json | null
          model?: string | null
          org_id?: string | null
          prompt?: string | null
          tenant_id?: string | null
          used_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: number
          metadata?: Json | null
          model?: string | null
          org_id?: string | null
          prompt?: string | null
          tenant_id?: string | null
          used_tokens?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "sdk_usage_org_id_fkey"
            columns: ["org_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      sql_logs: {
        Row: {
          context_target_identifiers: string[] | null
          created_at: string
          dialect: string
          executed_at: string | null
          id: string
          organization_id: string
          params: Json
          parent_log_id: string | null
          question: string
          rationale: string | null
          sql: string
          state: string
          tenant_id: string
          updated_at: string
        }
        Insert: {
          context_target_identifiers?: string[] | null
          created_at?: string
          dialect: string
          executed_at?: string | null
          id?: string
          organization_id: string
          params?: Json
          parent_log_id?: string | null
          question: string
          rationale?: string | null
          sql: string
          state: string
          tenant_id: string
          updated_at?: string
        }
        Update: {
          context_target_identifiers?: string[] | null
          created_at?: string
          dialect?: string
          executed_at?: string | null
          id?: string
          organization_id?: string
          params?: Json
          parent_log_id?: string | null
          question?: string
          rationale?: string | null
          sql?: string
          state?: string
          tenant_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sql_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sql_logs_parent_log_id_fkey"
            columns: ["parent_log_id"]
            isOneToOne: false
            referencedRelation: "sql_logs"
            referencedColumns: ["id"]
          },
        ]
      }
      subscriptions: {
        Row: {
          created_at: string | null
          email: string
          id: string
          source: string | null
          status: string | null
        }
        Insert: {
          created_at?: string | null
          email: string
          id?: string
          source?: string | null
          status?: string | null
        }
        Update: {
          created_at?: string | null
          email?: string
          id?: string
          source?: string | null
          status?: string | null
        }
        Relationships: []
      }
      table_schemas: {
        Row: {
          config: Json | null
          created_at: string
          hash: string
          id: string
          organization_id: string
          schema: Json
          tenant_settings: Json | null
          updated_at: string
        }
        Insert: {
          config?: Json | null
          created_at?: string
          hash: string
          id?: string
          organization_id: string
          schema: Json
          tenant_settings?: Json | null
          updated_at?: string
        }
        Update: {
          config?: Json | null
          created_at?: string
          hash?: string
          id?: string
          organization_id?: string
          schema?: Json
          tenant_settings?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "table_schemas_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      usage: {
        Row: {
          count: number
          id: number
          organization_id: string | null
          period_end: string
          period_start: string
          type: string
          user_id: string | null
        }
        Insert: {
          count?: number
          id?: number
          organization_id?: string | null
          period_end: string
          period_start: string
          type: string
          user_id?: string | null
        }
        Update: {
          count?: number
          id?: number
          organization_id?: string | null
          period_end?: string
          period_start?: string
          type?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "usage_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      widget_shares: {
        Row: {
          created_at: string | null
          customer_block_id: string
          id: string
          tenant_id: string
        }
        Insert: {
          created_at?: string | null
          customer_block_id: string
          id?: string
          tenant_id: string
        }
        Update: {
          created_at?: string | null
          customer_block_id?: string
          id?: string
          tenant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "widget_shares_customer_block_id_fkey"
            columns: ["customer_block_id"]
            isOneToOne: false
            referencedRelation: "customer_dashboard_blocks"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_secret: {
        Args: { description?: string; name?: string; secret: string }
        Returns: string
      }
      delete_user_account: { Args: { user_id: string }; Returns: undefined }
      exec_sql: { Args: { params?: Json; query: string }; Returns: Json }
      find_user_by_email: {
        Args: { user_email: string }
        Returns: {
          email: string
          id: string
        }[]
      }
      fn_is_org_admin: { Args: { p_org_id: string }; Returns: boolean }
      fn_is_org_member: { Args: { p_org_id: string }; Returns: boolean }
      fn_is_org_owner: { Args: { p_org_id: string }; Returns: boolean }
      generate_share_token: { Args: never; Returns: string }
      get_database_v4_with_schema: {
        Args: { p_database_name: string; p_organization_id: string }
        Returns: {
          chunk_count: number
          created_at: string
          database_name: string
          description: string
          dialect: string
          id: string
          ingestion_type: string
          last_ingested_at: string
          organization_id: string
          row_count: number
          schema_export: Json
          schema_hash: string
          table_count: number
          tenant_field_name: string
          updated_at: string
        }[]
      }
      get_databases_v4: {
        Args: { p_organization_id: string }
        Returns: {
          chunk_count: number
          created_at: string
          database_name: string
          description: string
          dialect: string
          id: string
          ingestion_type: string
          last_ingested_at: string
          organization_id: string
          row_count: number
          table_count: number
          tenant_field_name: string
          updated_at: string
        }[]
      }
      get_schema_chunks_v4_stats: {
        Args: { p_organization_id: string }
        Returns: {
          chunk_count: number
          database: string
          dialect: string
          last_updated: string
          total_embeddings: number
        }[]
      }
      get_secret: { Args: { secret_id: string }; Returns: string }
      hybrid_search_chunks: {
        Args: {
          filter?: Json
          full_text_weight?: number
          match_count?: number
          query_embedding: string
          query_text: string
          rrf_k?: number
          semantic_weight?: number
        }
        Returns: {
          content: string
          id: number
          metadata: Json
          score: number
        }[]
      }
      match_documents: {
        Args: { filter?: Json; match_count?: number; query_embedding: string }
        Returns: {
          content: string
          id: number
          metadata: Json
          similarity: number
        }[]
      }
      match_schema_chunks_v4: {
        Args: { filter?: Json; match_count?: number; query_embedding: string }
        Returns: {
          content: string
          embedding: string
          id: string
          metadata: Json
          similarity: number
        }[]
      }
      rag_search_schema_chunks: {
        Args: {
          p_chunk_types?: string[]
          p_has_foreign_keys?: boolean
          p_has_primary_key?: boolean
          p_match_count?: number
          p_min_columns?: number
          p_min_similarity?: number
          p_query_embedding: string
          p_require_rels?: boolean
          p_schema_name?: string
          p_table_name?: string
          p_tenant_id: string
        }
        Returns: {
          chunk_type: string
          column_count: number
          column_names: string[]
          content: string
          data_types: string[]
          distance: number
          has_foreign_keys: boolean
          has_primary_key: boolean
          has_relationships: boolean
          id: string
          schema_name: string
          similarity: number
          table_name: string
        }[]
      }
      rag_search_schema_chunks_v2: {
        Args: {
          p_chunk_types?: string[]
          p_has_foreign_keys?: boolean
          p_has_primary_key?: boolean
          p_match_count?: number
          p_min_columns?: number
          p_min_similarity?: number
          p_organization_id: string
          p_query_embedding: string
          p_require_rels?: boolean
          p_schema_name?: string
          p_table_name?: string
          p_target_db?: string
        }
        Returns: {
          chunk_type: string
          column_count: number
          column_names: string[]
          content: string
          data_types: string[]
          distance: number
          has_foreign_keys: boolean
          has_primary_key: boolean
          has_relationships: boolean
          id: string
          schema_name: string
          similarity: number
          table_name: string
          target_db: string
        }[]
      }
      update_report_content: {
        Args: { new_content: Json; report_id: string }
        Returns: boolean
      }
    }
    Enums: {
      chunk_type_v4:
        | "db_overview"
        | "table_overview"
        | "column_group"
        | "relationship"
        | "glossary"
        | "gold_sql"
        | "table_context"
        | "column_context"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      chunk_type_v4: [
        "db_overview",
        "table_overview",
        "column_group",
        "relationship",
        "glossary",
        "gold_sql",
        "table_context",
        "column_context",
      ],
    },
  },
} as const
