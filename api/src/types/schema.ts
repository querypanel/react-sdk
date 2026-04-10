export interface Column {
	name: string;
	data_type: string;
	is_primary_key: boolean;
	description: string;
}

export interface Table {
	table_name: string;
	description: string;
	columns: Column[];
}

export interface Schema {
	database: string;
	dialect: string;
	tables: Table[];
}
