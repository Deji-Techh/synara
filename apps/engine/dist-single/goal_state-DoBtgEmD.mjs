#!/usr/bin/env node
import { fileURLToPath as __cFL } from "node:url";
import * as __cDP from "node:path";
const __filename = __cFL(import.meta.url);
const __dirname = __cDP.dirname(__filename);

import { o as __toESM, r as __exportAll } from "./chunk-CeepVFa8.mjs";
import { Nt as require_src, V as _enum, Y as boolean, at as object, it as number, lt as string, o as getUserDataPath, q as array } from "./paths-Cht_zAlA.mjs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Database from "better-sqlite3";
import crypto$1 from "node:crypto";
import fs from "node:fs";

//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/entity.js
const entityKind = Symbol.for("drizzle:entityKind");
const hasOwnEntityKind = Symbol.for("drizzle:hasOwnEntityKind");
function is(value, type) {
	if (!value || typeof value !== "object") return false;
	if (value instanceof type) return true;
	if (!Object.prototype.hasOwnProperty.call(type, entityKind)) throw new Error(`Class "${type.name ?? "<unknown>"}" doesn't look like a Drizzle entity. If this is incorrect and the class is provided by Drizzle, please report this as a bug.`);
	let cls = Object.getPrototypeOf(value).constructor;
	if (cls) while (cls) {
		if (entityKind in cls && cls[entityKind] === type[entityKind]) return true;
		cls = Object.getPrototypeOf(cls);
	}
	return false;
}

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/logger.js
var ConsoleLogWriter = class {
	static [entityKind] = "ConsoleLogWriter";
	write(message) {
		console.log(message);
	}
};
var DefaultLogger = class {
	static [entityKind] = "DefaultLogger";
	writer;
	constructor(config) {
		this.writer = config?.writer ?? new ConsoleLogWriter();
	}
	logQuery(query, params) {
		const stringifiedParams = params.map((p) => {
			try {
				return JSON.stringify(p);
			} catch {
				return String(p);
			}
		});
		const paramsStr = stringifiedParams.length ? ` -- params: [${stringifiedParams.join(", ")}]` : "";
		this.writer.write(`Query: ${query}${paramsStr}`);
	}
};
var NoopLogger = class {
	static [entityKind] = "NoopLogger";
	logQuery() {}
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/table.utils.js
const TableName = Symbol.for("drizzle:Name");

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/table.js
const Schema = Symbol.for("drizzle:Schema");
const Columns = Symbol.for("drizzle:Columns");
const ExtraConfigColumns = Symbol.for("drizzle:ExtraConfigColumns");
const OriginalName = Symbol.for("drizzle:OriginalName");
const BaseName = Symbol.for("drizzle:BaseName");
const IsAlias = Symbol.for("drizzle:IsAlias");
const ExtraConfigBuilder = Symbol.for("drizzle:ExtraConfigBuilder");
const IsDrizzleTable = Symbol.for("drizzle:IsDrizzleTable");
var Table = class {
	static [entityKind] = "Table";
	/** @internal */
	static Symbol = {
		Name: TableName,
		Schema,
		OriginalName,
		Columns,
		ExtraConfigColumns,
		BaseName,
		IsAlias,
		ExtraConfigBuilder
	};
	/**
	* @internal
	* Can be changed if the table is aliased.
	*/
	[TableName];
	/**
	* @internal
	* Used to store the original name of the table, before any aliasing.
	*/
	[OriginalName];
	/** @internal */
	[Schema];
	/** @internal */
	[Columns];
	/** @internal */
	[ExtraConfigColumns];
	/**
	*  @internal
	* Used to store the table name before the transformation via the `tableCreator` functions.
	*/
	[BaseName];
	/** @internal */
	[IsAlias] = false;
	/** @internal */
	[IsDrizzleTable] = true;
	/** @internal */
	[ExtraConfigBuilder] = void 0;
	constructor(name, schema, baseName) {
		this[TableName] = this[OriginalName] = name;
		this[Schema] = schema;
		this[BaseName] = baseName;
	}
};
function getTableName(table) {
	return table[TableName];
}
function getTableUniqueName(table) {
	return `${table[Schema] ?? "public"}.${table[TableName]}`;
}

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/column.js
var Column = class {
	constructor(table, config) {
		this.table = table;
		this.config = config;
		this.name = config.name;
		this.keyAsName = config.keyAsName;
		this.notNull = config.notNull;
		this.default = config.default;
		this.defaultFn = config.defaultFn;
		this.onUpdateFn = config.onUpdateFn;
		this.hasDefault = config.hasDefault;
		this.primary = config.primaryKey;
		this.isUnique = config.isUnique;
		this.uniqueName = config.uniqueName;
		this.uniqueType = config.uniqueType;
		this.dataType = config.dataType;
		this.columnType = config.columnType;
		this.generated = config.generated;
		this.generatedIdentity = config.generatedIdentity;
	}
	static [entityKind] = "Column";
	name;
	keyAsName;
	primary;
	notNull;
	default;
	defaultFn;
	onUpdateFn;
	hasDefault;
	isUnique;
	uniqueName;
	uniqueType;
	dataType;
	columnType;
	enumValues = void 0;
	generated = void 0;
	generatedIdentity = void 0;
	config;
	mapFromDriverValue(value) {
		return value;
	}
	mapToDriverValue(value) {
		return value;
	}
	shouldDisableInsert() {
		return this.config.generated !== void 0 && this.config.generated.type !== "byDefault";
	}
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/column-builder.js
var ColumnBuilder = class {
	static [entityKind] = "ColumnBuilder";
	config;
	constructor(name, dataType, columnType) {
		this.config = {
			name,
			keyAsName: name === "",
			notNull: false,
			default: void 0,
			hasDefault: false,
			primaryKey: false,
			isUnique: false,
			uniqueName: void 0,
			uniqueType: void 0,
			dataType,
			columnType,
			generated: void 0
		};
	}
	/**
	* Changes the data type of the column. Commonly used with `json` columns. Also, useful for branded types.
	*
	* @example
	* ```ts
	* const users = pgTable('users', {
	* 	id: integer('id').$type<UserId>().primaryKey(),
	* 	details: json('details').$type<UserDetails>().notNull(),
	* });
	* ```
	*/
	$type() {
		return this;
	}
	/**
	* Adds a `not null` clause to the column definition.
	*
	* Affects the `select` model of the table - columns *without* `not null` will be nullable on select.
	*/
	notNull() {
		this.config.notNull = true;
		return this;
	}
	/**
	* Adds a `default <value>` clause to the column definition.
	*
	* Affects the `insert` model of the table - columns *with* `default` are optional on insert.
	*
	* If you need to set a dynamic default value, use {@link $defaultFn} instead.
	*/
	default(value) {
		this.config.default = value;
		this.config.hasDefault = true;
		return this;
	}
	/**
	* Adds a dynamic default value to the column.
	* The function will be called when the row is inserted, and the returned value will be used as the column value.
	*
	* **Note:** This value does not affect the `drizzle-kit` behavior, it is only used at runtime in `drizzle-orm`.
	*/
	$defaultFn(fn) {
		this.config.defaultFn = fn;
		this.config.hasDefault = true;
		return this;
	}
	/**
	* Alias for {@link $defaultFn}.
	*/
	$default = this.$defaultFn;
	/**
	* Adds a dynamic update value to the column.
	* The function will be called when the row is updated, and the returned value will be used as the column value if none is provided.
	* If no `default` (or `$defaultFn`) value is provided, the function will be called when the row is inserted as well, and the returned value will be used as the column value.
	*
	* **Note:** This value does not affect the `drizzle-kit` behavior, it is only used at runtime in `drizzle-orm`.
	*/
	$onUpdateFn(fn) {
		this.config.onUpdateFn = fn;
		this.config.hasDefault = true;
		return this;
	}
	/**
	* Alias for {@link $onUpdateFn}.
	*/
	$onUpdate = this.$onUpdateFn;
	/**
	* Adds a `primary key` clause to the column definition. This implicitly makes the column `not null`.
	*
	* In SQLite, `integer primary key` implicitly makes the column auto-incrementing.
	*/
	primaryKey() {
		this.config.primaryKey = true;
		this.config.notNull = true;
		return this;
	}
	/** @internal Sets the name of the column to the key within the table definition if a name was not given. */
	setName(name) {
		if (this.config.name !== "") return;
		this.config.name = name;
	}
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/pg-core/foreign-keys.js
var ForeignKeyBuilder$1 = class {
	static [entityKind] = "PgForeignKeyBuilder";
	/** @internal */
	reference;
	/** @internal */
	_onUpdate = "no action";
	/** @internal */
	_onDelete = "no action";
	constructor(config, actions) {
		this.reference = () => {
			const { name, columns, foreignColumns } = config();
			return {
				name,
				columns,
				foreignTable: foreignColumns[0].table,
				foreignColumns
			};
		};
		if (actions) {
			this._onUpdate = actions.onUpdate;
			this._onDelete = actions.onDelete;
		}
	}
	onUpdate(action) {
		this._onUpdate = action === void 0 ? "no action" : action;
		return this;
	}
	onDelete(action) {
		this._onDelete = action === void 0 ? "no action" : action;
		return this;
	}
	/** @internal */
	build(table) {
		return new ForeignKey$1(table, this);
	}
};
var ForeignKey$1 = class {
	constructor(table, builder) {
		this.table = table;
		this.reference = builder.reference;
		this.onUpdate = builder._onUpdate;
		this.onDelete = builder._onDelete;
	}
	static [entityKind] = "PgForeignKey";
	reference;
	onUpdate;
	onDelete;
	getName() {
		const { name, columns, foreignColumns } = this.reference();
		const columnNames = columns.map((column) => column.name);
		const foreignColumnNames = foreignColumns.map((column) => column.name);
		const chunks = [
			this.table[TableName],
			...columnNames,
			foreignColumns[0].table[TableName],
			...foreignColumnNames
		];
		return name ?? `${chunks.join("_")}_fk`;
	}
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/tracing-utils.js
function iife(fn, ...args) {
	return fn(...args);
}

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/pg-core/unique-constraint.js
function uniqueKeyName$1(table, columns) {
	return `${table[TableName]}_${columns.join("_")}_unique`;
}
var UniqueConstraintBuilder$1 = class {
	constructor(columns, name) {
		this.name = name;
		this.columns = columns;
	}
	static [entityKind] = "PgUniqueConstraintBuilder";
	/** @internal */
	columns;
	/** @internal */
	nullsNotDistinctConfig = false;
	nullsNotDistinct() {
		this.nullsNotDistinctConfig = true;
		return this;
	}
	/** @internal */
	build(table) {
		return new UniqueConstraint$1(table, this.columns, this.nullsNotDistinctConfig, this.name);
	}
};
var UniqueOnConstraintBuilder$1 = class {
	static [entityKind] = "PgUniqueOnConstraintBuilder";
	/** @internal */
	name;
	constructor(name) {
		this.name = name;
	}
	on(...columns) {
		return new UniqueConstraintBuilder$1(columns, this.name);
	}
};
var UniqueConstraint$1 = class {
	constructor(table, columns, nullsNotDistinct, name) {
		this.table = table;
		this.columns = columns;
		this.name = name ?? uniqueKeyName$1(this.table, this.columns.map((column) => column.name));
		this.nullsNotDistinct = nullsNotDistinct;
	}
	static [entityKind] = "PgUniqueConstraint";
	columns;
	name;
	nullsNotDistinct = false;
	getName() {
		return this.name;
	}
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/pg-core/utils/array.js
function parsePgArrayValue(arrayString, startFrom, inQuotes) {
	for (let i = startFrom; i < arrayString.length; i++) {
		const char = arrayString[i];
		if (char === "\\") {
			i++;
			continue;
		}
		if (char === "\"") return [arrayString.slice(startFrom, i).replace(/\\/g, ""), i + 1];
		if (inQuotes) continue;
		if (char === "," || char === "}") return [arrayString.slice(startFrom, i).replace(/\\/g, ""), i];
	}
	return [arrayString.slice(startFrom).replace(/\\/g, ""), arrayString.length];
}
function parsePgNestedArray(arrayString, startFrom = 0) {
	const result = [];
	let i = startFrom;
	let lastCharIsComma = false;
	while (i < arrayString.length) {
		const char = arrayString[i];
		if (char === ",") {
			if (lastCharIsComma || i === startFrom) result.push("");
			lastCharIsComma = true;
			i++;
			continue;
		}
		lastCharIsComma = false;
		if (char === "\\") {
			i += 2;
			continue;
		}
		if (char === "\"") {
			const [value2, startFrom2] = parsePgArrayValue(arrayString, i + 1, true);
			result.push(value2);
			i = startFrom2;
			continue;
		}
		if (char === "}") return [result, i + 1];
		if (char === "{") {
			const [value2, startFrom2] = parsePgNestedArray(arrayString, i + 1);
			result.push(value2);
			i = startFrom2;
			continue;
		}
		const [value, newStartFrom] = parsePgArrayValue(arrayString, i, false);
		result.push(value);
		i = newStartFrom;
	}
	return [result, i];
}
function parsePgArray(arrayString) {
	const [result] = parsePgNestedArray(arrayString, 1);
	return result;
}
function makePgArray(array) {
	return `{${array.map((item) => {
		if (Array.isArray(item)) return makePgArray(item);
		if (typeof item === "string") return `"${item.replace(/\\/g, "\\\\").replace(/"/g, "\\\"")}"`;
		return `${item}`;
	}).join(",")}}`;
}

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/pg-core/columns/common.js
var PgColumnBuilder = class extends ColumnBuilder {
	foreignKeyConfigs = [];
	static [entityKind] = "PgColumnBuilder";
	array(size) {
		return new PgArrayBuilder(this.config.name, this, size);
	}
	references(ref, actions = {}) {
		this.foreignKeyConfigs.push({
			ref,
			actions
		});
		return this;
	}
	unique(name, config) {
		this.config.isUnique = true;
		this.config.uniqueName = name;
		this.config.uniqueType = config?.nulls;
		return this;
	}
	generatedAlwaysAs(as) {
		this.config.generated = {
			as,
			type: "always",
			mode: "stored"
		};
		return this;
	}
	/** @internal */
	buildForeignKeys(column, table) {
		return this.foreignKeyConfigs.map(({ ref, actions }) => {
			return iife((ref2, actions2) => {
				const builder = new ForeignKeyBuilder$1(() => {
					const foreignColumn = ref2();
					return {
						columns: [column],
						foreignColumns: [foreignColumn]
					};
				});
				if (actions2.onUpdate) builder.onUpdate(actions2.onUpdate);
				if (actions2.onDelete) builder.onDelete(actions2.onDelete);
				return builder.build(table);
			}, ref, actions);
		});
	}
	/** @internal */
	buildExtraConfigColumn(table) {
		return new ExtraConfigColumn(table, this.config);
	}
};
var PgColumn = class extends Column {
	constructor(table, config) {
		if (!config.uniqueName) config.uniqueName = uniqueKeyName$1(table, [config.name]);
		super(table, config);
		this.table = table;
	}
	static [entityKind] = "PgColumn";
};
var ExtraConfigColumn = class extends PgColumn {
	static [entityKind] = "ExtraConfigColumn";
	getSQLType() {
		return this.getSQLType();
	}
	indexConfig = {
		order: this.config.order ?? "asc",
		nulls: this.config.nulls ?? "last",
		opClass: this.config.opClass
	};
	defaultConfig = {
		order: "asc",
		nulls: "last",
		opClass: void 0
	};
	asc() {
		this.indexConfig.order = "asc";
		return this;
	}
	desc() {
		this.indexConfig.order = "desc";
		return this;
	}
	nullsFirst() {
		this.indexConfig.nulls = "first";
		return this;
	}
	nullsLast() {
		this.indexConfig.nulls = "last";
		return this;
	}
	/**
	* ### PostgreSQL documentation quote
	*
	* > An operator class with optional parameters can be specified for each column of an index.
	* The operator class identifies the operators to be used by the index for that column.
	* For example, a B-tree index on four-byte integers would use the int4_ops class;
	* this operator class includes comparison functions for four-byte integers.
	* In practice the default operator class for the column's data type is usually sufficient.
	* The main point of having operator classes is that for some data types, there could be more than one meaningful ordering.
	* For example, we might want to sort a complex-number data type either by absolute value or by real part.
	* We could do this by defining two operator classes for the data type and then selecting the proper class when creating an index.
	* More information about operator classes check:
	*
	* ### Useful links
	* https://www.postgresql.org/docs/current/sql-createindex.html
	*
	* https://www.postgresql.org/docs/current/indexes-opclass.html
	*
	* https://www.postgresql.org/docs/current/xindex.html
	*
	* ### Additional types
	* If you have the `pg_vector` extension installed in your database, you can use the
	* `vector_l2_ops`, `vector_ip_ops`, `vector_cosine_ops`, `vector_l1_ops`, `bit_hamming_ops`, `bit_jaccard_ops`, `halfvec_l2_ops`, `sparsevec_l2_ops` options, which are predefined types.
	*
	* **You can always specify any string you want in the operator class, in case Drizzle doesn't have it natively in its types**
	*
	* @param opClass
	* @returns
	*/
	op(opClass) {
		this.indexConfig.opClass = opClass;
		return this;
	}
};
var IndexedColumn = class {
	static [entityKind] = "IndexedColumn";
	constructor(name, keyAsName, type, indexConfig) {
		this.name = name;
		this.keyAsName = keyAsName;
		this.type = type;
		this.indexConfig = indexConfig;
	}
	name;
	keyAsName;
	type;
	indexConfig;
};
var PgArrayBuilder = class extends PgColumnBuilder {
	static [entityKind] = "PgArrayBuilder";
	constructor(name, baseBuilder, size) {
		super(name, "array", "PgArray");
		this.config.baseBuilder = baseBuilder;
		this.config.size = size;
	}
	/** @internal */
	build(table) {
		const baseColumn = this.config.baseBuilder.build(table);
		return new PgArray(table, this.config, baseColumn);
	}
};
var PgArray = class PgArray extends PgColumn {
	constructor(table, config, baseColumn, range) {
		super(table, config);
		this.baseColumn = baseColumn;
		this.range = range;
		this.size = config.size;
	}
	size;
	static [entityKind] = "PgArray";
	getSQLType() {
		return `${this.baseColumn.getSQLType()}[${typeof this.size === "number" ? this.size : ""}]`;
	}
	mapFromDriverValue(value) {
		if (typeof value === "string") value = parsePgArray(value);
		return value.map((v) => this.baseColumn.mapFromDriverValue(v));
	}
	mapToDriverValue(value, isNestedArray = false) {
		const a = value.map((v) => v === null ? null : is(this.baseColumn, PgArray) ? this.baseColumn.mapToDriverValue(v, true) : this.baseColumn.mapToDriverValue(v));
		if (isNestedArray) return a;
		return makePgArray(a);
	}
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/pg-core/columns/enum.js
var PgEnumObjectColumnBuilder = class extends PgColumnBuilder {
	static [entityKind] = "PgEnumObjectColumnBuilder";
	constructor(name, enumInstance) {
		super(name, "string", "PgEnumObjectColumn");
		this.config.enum = enumInstance;
	}
	/** @internal */
	build(table) {
		return new PgEnumObjectColumn(table, this.config);
	}
};
var PgEnumObjectColumn = class extends PgColumn {
	static [entityKind] = "PgEnumObjectColumn";
	enum;
	enumValues = this.config.enum.enumValues;
	constructor(table, config) {
		super(table, config);
		this.enum = config.enum;
	}
	getSQLType() {
		return this.enum.enumName;
	}
};
const isPgEnumSym = Symbol.for("drizzle:isPgEnum");
function isPgEnum(obj) {
	return !!obj && typeof obj === "function" && isPgEnumSym in obj && obj[isPgEnumSym] === true;
}
var PgEnumColumnBuilder = class extends PgColumnBuilder {
	static [entityKind] = "PgEnumColumnBuilder";
	constructor(name, enumInstance) {
		super(name, "string", "PgEnumColumn");
		this.config.enum = enumInstance;
	}
	/** @internal */
	build(table) {
		return new PgEnumColumn(table, this.config);
	}
};
var PgEnumColumn = class extends PgColumn {
	static [entityKind] = "PgEnumColumn";
	enum = this.config.enum;
	enumValues = this.config.enum.enumValues;
	constructor(table, config) {
		super(table, config);
		this.enum = config.enum;
	}
	getSQLType() {
		return this.enum.enumName;
	}
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/subquery.js
var Subquery = class {
	static [entityKind] = "Subquery";
	constructor(sql, fields, alias, isWith = false, usedTables = []) {
		this._ = {
			brand: "Subquery",
			sql,
			selectedFields: fields,
			alias,
			isWith,
			usedTables
		};
	}
};
var WithSubquery = class extends Subquery {
	static [entityKind] = "WithSubquery";
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/tracing.js
const tracer = { startActiveSpan(name, fn) {
	return fn();
} };

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/view-common.js
const ViewBaseConfig = Symbol.for("drizzle:ViewBaseConfig");

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/sql/sql.js
var FakePrimitiveParam = class {
	static [entityKind] = "FakePrimitiveParam";
};
function isSQLWrapper(value) {
	return value !== null && value !== void 0 && typeof value.getSQL === "function";
}
function mergeQueries(queries) {
	const result = {
		sql: "",
		params: []
	};
	for (const query of queries) {
		result.sql += query.sql;
		result.params.push(...query.params);
		if (query.typings?.length) {
			if (!result.typings) result.typings = [];
			result.typings.push(...query.typings);
		}
	}
	return result;
}
var StringChunk = class {
	static [entityKind] = "StringChunk";
	value;
	constructor(value) {
		this.value = Array.isArray(value) ? value : [value];
	}
	getSQL() {
		return new SQL([this]);
	}
};
var SQL = class SQL {
	constructor(queryChunks) {
		this.queryChunks = queryChunks;
		for (const chunk of queryChunks) if (is(chunk, Table)) {
			const schemaName = chunk[Table.Symbol.Schema];
			this.usedTables.push(schemaName === void 0 ? chunk[Table.Symbol.Name] : schemaName + "." + chunk[Table.Symbol.Name]);
		}
	}
	static [entityKind] = "SQL";
	/** @internal */
	decoder = noopDecoder;
	shouldInlineParams = false;
	/** @internal */
	usedTables = [];
	append(query) {
		this.queryChunks.push(...query.queryChunks);
		return this;
	}
	toQuery(config) {
		return tracer.startActiveSpan("drizzle.buildSQL", (span) => {
			const query = this.buildQueryFromSourceParams(this.queryChunks, config);
			span?.setAttributes({
				"drizzle.query.text": query.sql,
				"drizzle.query.params": JSON.stringify(query.params)
			});
			return query;
		});
	}
	buildQueryFromSourceParams(chunks, _config) {
		const config = Object.assign({}, _config, {
			inlineParams: _config.inlineParams || this.shouldInlineParams,
			paramStartIndex: _config.paramStartIndex || { value: 0 }
		});
		const { casing, escapeName, escapeParam, prepareTyping, inlineParams, paramStartIndex } = config;
		return mergeQueries(chunks.map((chunk) => {
			if (is(chunk, StringChunk)) return {
				sql: chunk.value.join(""),
				params: []
			};
			if (is(chunk, Name)) return {
				sql: escapeName(chunk.value),
				params: []
			};
			if (chunk === void 0) return {
				sql: "",
				params: []
			};
			if (Array.isArray(chunk)) {
				const result = [new StringChunk("(")];
				for (const [i, p] of chunk.entries()) {
					result.push(p);
					if (i < chunk.length - 1) result.push(new StringChunk(", "));
				}
				result.push(new StringChunk(")"));
				return this.buildQueryFromSourceParams(result, config);
			}
			if (is(chunk, SQL)) return this.buildQueryFromSourceParams(chunk.queryChunks, {
				...config,
				inlineParams: inlineParams || chunk.shouldInlineParams
			});
			if (is(chunk, Table)) {
				const schemaName = chunk[Table.Symbol.Schema];
				const tableName = chunk[Table.Symbol.Name];
				return {
					sql: schemaName === void 0 || chunk[IsAlias] ? escapeName(tableName) : escapeName(schemaName) + "." + escapeName(tableName),
					params: []
				};
			}
			if (is(chunk, Column)) {
				const columnName = casing.getColumnCasing(chunk);
				if (_config.invokeSource === "indexes") return {
					sql: escapeName(columnName),
					params: []
				};
				const schemaName = chunk.table[Table.Symbol.Schema];
				return {
					sql: chunk.table[IsAlias] || schemaName === void 0 ? escapeName(chunk.table[Table.Symbol.Name]) + "." + escapeName(columnName) : escapeName(schemaName) + "." + escapeName(chunk.table[Table.Symbol.Name]) + "." + escapeName(columnName),
					params: []
				};
			}
			if (is(chunk, View)) {
				const schemaName = chunk[ViewBaseConfig].schema;
				const viewName = chunk[ViewBaseConfig].name;
				return {
					sql: schemaName === void 0 || chunk[ViewBaseConfig].isAlias ? escapeName(viewName) : escapeName(schemaName) + "." + escapeName(viewName),
					params: []
				};
			}
			if (is(chunk, Param)) {
				if (is(chunk.value, Placeholder)) return {
					sql: escapeParam(paramStartIndex.value++, chunk),
					params: [chunk],
					typings: ["none"]
				};
				const mappedValue = chunk.value === null ? null : chunk.encoder.mapToDriverValue(chunk.value);
				if (is(mappedValue, SQL)) return this.buildQueryFromSourceParams([mappedValue], config);
				if (inlineParams) return {
					sql: this.mapInlineParam(mappedValue, config),
					params: []
				};
				let typings = ["none"];
				if (prepareTyping) typings = [prepareTyping(chunk.encoder)];
				return {
					sql: escapeParam(paramStartIndex.value++, mappedValue),
					params: [mappedValue],
					typings
				};
			}
			if (is(chunk, Placeholder)) return {
				sql: escapeParam(paramStartIndex.value++, chunk),
				params: [chunk],
				typings: ["none"]
			};
			if (is(chunk, SQL.Aliased) && chunk.fieldAlias !== void 0) return {
				sql: escapeName(chunk.fieldAlias),
				params: []
			};
			if (is(chunk, Subquery)) {
				if (chunk._.isWith) return {
					sql: escapeName(chunk._.alias),
					params: []
				};
				return this.buildQueryFromSourceParams([
					new StringChunk("("),
					chunk._.sql,
					new StringChunk(") "),
					new Name(chunk._.alias)
				], config);
			}
			if (isPgEnum(chunk)) {
				if (chunk.schema) return {
					sql: escapeName(chunk.schema) + "." + escapeName(chunk.enumName),
					params: []
				};
				return {
					sql: escapeName(chunk.enumName),
					params: []
				};
			}
			if (isSQLWrapper(chunk)) {
				if (chunk.shouldOmitSQLParens?.()) return this.buildQueryFromSourceParams([chunk.getSQL()], config);
				return this.buildQueryFromSourceParams([
					new StringChunk("("),
					chunk.getSQL(),
					new StringChunk(")")
				], config);
			}
			if (inlineParams) return {
				sql: this.mapInlineParam(chunk, config),
				params: []
			};
			return {
				sql: escapeParam(paramStartIndex.value++, chunk),
				params: [chunk],
				typings: ["none"]
			};
		}));
	}
	mapInlineParam(chunk, { escapeString }) {
		if (chunk === null) return "null";
		if (typeof chunk === "number" || typeof chunk === "boolean") return chunk.toString();
		if (typeof chunk === "string") return escapeString(chunk);
		if (typeof chunk === "object") {
			const mappedValueAsString = chunk.toString();
			if (mappedValueAsString === "[object Object]") return escapeString(JSON.stringify(chunk));
			return escapeString(mappedValueAsString);
		}
		throw new Error("Unexpected param value: " + chunk);
	}
	getSQL() {
		return this;
	}
	as(alias) {
		if (alias === void 0) return this;
		return new SQL.Aliased(this, alias);
	}
	mapWith(decoder) {
		this.decoder = typeof decoder === "function" ? { mapFromDriverValue: decoder } : decoder;
		return this;
	}
	inlineParams() {
		this.shouldInlineParams = true;
		return this;
	}
	/**
	* This method is used to conditionally include a part of the query.
	*
	* @param condition - Condition to check
	* @returns itself if the condition is `true`, otherwise `undefined`
	*/
	if(condition) {
		return condition ? this : void 0;
	}
};
var Name = class {
	constructor(value) {
		this.value = value;
	}
	static [entityKind] = "Name";
	brand;
	getSQL() {
		return new SQL([this]);
	}
};
function isDriverValueEncoder(value) {
	return typeof value === "object" && value !== null && "mapToDriverValue" in value && typeof value.mapToDriverValue === "function";
}
const noopDecoder = { mapFromDriverValue: (value) => value };
const noopEncoder = { mapToDriverValue: (value) => value };
const noopMapper = {
	...noopDecoder,
	...noopEncoder
};
var Param = class {
	/**
	* @param value - Parameter value
	* @param encoder - Encoder to convert the value to a driver parameter
	*/
	constructor(value, encoder = noopEncoder) {
		this.value = value;
		this.encoder = encoder;
	}
	static [entityKind] = "Param";
	brand;
	getSQL() {
		return new SQL([this]);
	}
};
function sql(strings, ...params) {
	const queryChunks = [];
	if (params.length > 0 || strings.length > 0 && strings[0] !== "") queryChunks.push(new StringChunk(strings[0]));
	for (const [paramIndex, param2] of params.entries()) queryChunks.push(param2, new StringChunk(strings[paramIndex + 1]));
	return new SQL(queryChunks);
}
((sql2) => {
	function empty() {
		return new SQL([]);
	}
	sql2.empty = empty;
	function fromList(list) {
		return new SQL(list);
	}
	sql2.fromList = fromList;
	function raw(str) {
		return new SQL([new StringChunk(str)]);
	}
	sql2.raw = raw;
	function join(chunks, separator) {
		const result = [];
		for (const [i, chunk] of chunks.entries()) {
			if (i > 0 && separator !== void 0) result.push(separator);
			result.push(chunk);
		}
		return new SQL(result);
	}
	sql2.join = join;
	function identifier(value) {
		return new Name(value);
	}
	sql2.identifier = identifier;
	function placeholder2(name2) {
		return new Placeholder(name2);
	}
	sql2.placeholder = placeholder2;
	function param2(value, encoder) {
		return new Param(value, encoder);
	}
	sql2.param = param2;
})(sql || (sql = {}));
((SQL2) => {
	class Aliased {
		constructor(sql2, fieldAlias) {
			this.sql = sql2;
			this.fieldAlias = fieldAlias;
		}
		static [entityKind] = "SQL.Aliased";
		/** @internal */
		isSelectionField = false;
		getSQL() {
			return this.sql;
		}
		/** @internal */
		clone() {
			return new Aliased(this.sql, this.fieldAlias);
		}
	}
	SQL2.Aliased = Aliased;
})(SQL || (SQL = {}));
var Placeholder = class {
	constructor(name2) {
		this.name = name2;
	}
	static [entityKind] = "Placeholder";
	getSQL() {
		return new SQL([this]);
	}
};
function fillPlaceholders(params, values) {
	return params.map((p) => {
		if (is(p, Placeholder)) {
			if (!(p.name in values)) throw new Error(`No value for placeholder "${p.name}" was provided`);
			return values[p.name];
		}
		if (is(p, Param) && is(p.value, Placeholder)) {
			if (!(p.value.name in values)) throw new Error(`No value for placeholder "${p.value.name}" was provided`);
			return p.encoder.mapToDriverValue(values[p.value.name]);
		}
		return p;
	});
}
const IsDrizzleView = Symbol.for("drizzle:IsDrizzleView");
var View = class {
	static [entityKind] = "View";
	/** @internal */
	[ViewBaseConfig];
	/** @internal */
	[IsDrizzleView] = true;
	constructor({ name: name2, schema, selectedFields, query }) {
		this[ViewBaseConfig] = {
			name: name2,
			originalName: name2,
			schema,
			selectedFields,
			query,
			isExisting: !query,
			isAlias: false
		};
	}
	getSQL() {
		return new SQL([this]);
	}
};
Column.prototype.getSQL = function() {
	return new SQL([this]);
};
Table.prototype.getSQL = function() {
	return new SQL([this]);
};
Subquery.prototype.getSQL = function() {
	return new SQL([this]);
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/utils.js
function mapResultRow(columns, row, joinsNotNullableMap) {
	const nullifyMap = {};
	const result = columns.reduce((result2, { path, field }, columnIndex) => {
		let decoder;
		if (is(field, Column)) decoder = field;
		else if (is(field, SQL)) decoder = field.decoder;
		else if (is(field, Subquery)) decoder = field._.sql.decoder;
		else decoder = field.sql.decoder;
		let node = result2;
		for (const [pathChunkIndex, pathChunk] of path.entries()) if (pathChunkIndex < path.length - 1) {
			if (!(pathChunk in node)) node[pathChunk] = {};
			node = node[pathChunk];
		} else {
			const rawValue = row[columnIndex];
			const value = node[pathChunk] = rawValue === null ? null : decoder.mapFromDriverValue(rawValue);
			if (joinsNotNullableMap && is(field, Column) && path.length === 2) {
				const objectName = path[0];
				if (!(objectName in nullifyMap)) nullifyMap[objectName] = value === null ? getTableName(field.table) : false;
				else if (typeof nullifyMap[objectName] === "string" && nullifyMap[objectName] !== getTableName(field.table)) nullifyMap[objectName] = false;
			}
		}
		return result2;
	}, {});
	if (joinsNotNullableMap && Object.keys(nullifyMap).length > 0) {
		for (const [objectName, tableName] of Object.entries(nullifyMap)) if (typeof tableName === "string" && !joinsNotNullableMap[tableName]) result[objectName] = null;
	}
	return result;
}
function orderSelectedFields(fields, pathPrefix) {
	return Object.entries(fields).reduce((result, [name, field]) => {
		if (typeof name !== "string") return result;
		const newPath = pathPrefix ? [...pathPrefix, name] : [name];
		if (is(field, Column) || is(field, SQL) || is(field, SQL.Aliased) || is(field, Subquery)) result.push({
			path: newPath,
			field
		});
		else if (is(field, Table)) result.push(...orderSelectedFields(field[Table.Symbol.Columns], newPath));
		else result.push(...orderSelectedFields(field, newPath));
		return result;
	}, []);
}
function haveSameKeys(left, right) {
	const leftKeys = Object.keys(left);
	const rightKeys = Object.keys(right);
	if (leftKeys.length !== rightKeys.length) return false;
	for (const [index, key] of leftKeys.entries()) if (key !== rightKeys[index]) return false;
	return true;
}
function mapUpdateSet(table, values) {
	const entries = Object.entries(values).filter(([, value]) => value !== void 0).map(([key, value]) => {
		if (is(value, SQL) || is(value, Column)) return [key, value];
		else return [key, new Param(value, table[Table.Symbol.Columns][key])];
	});
	if (entries.length === 0) throw new Error("No values to set");
	return Object.fromEntries(entries);
}
function applyMixins(baseClass, extendedClasses) {
	for (const extendedClass of extendedClasses) for (const name of Object.getOwnPropertyNames(extendedClass.prototype)) {
		if (name === "constructor") continue;
		Object.defineProperty(baseClass.prototype, name, Object.getOwnPropertyDescriptor(extendedClass.prototype, name) || /* @__PURE__ */ Object.create(null));
	}
}
function getTableColumns(table) {
	return table[Table.Symbol.Columns];
}
function getTableLikeName(table) {
	return is(table, Subquery) ? table._.alias : is(table, View) ? table[ViewBaseConfig].name : is(table, SQL) ? void 0 : table[Table.Symbol.IsAlias] ? table[Table.Symbol.Name] : table[Table.Symbol.BaseName];
}
function getColumnNameAndConfig(a, b) {
	return {
		name: typeof a === "string" && a.length > 0 ? a : "",
		config: typeof a === "object" ? a : b
	};
}
function isConfig(data) {
	if (typeof data !== "object" || data === null) return false;
	if (data.constructor.name !== "Object") return false;
	if ("logger" in data) {
		const type = typeof data["logger"];
		if (type !== "boolean" && (type !== "object" || typeof data["logger"]["logQuery"] !== "function") && type !== "undefined") return false;
		return true;
	}
	if ("schema" in data) {
		const type = typeof data["schema"];
		if (type !== "object" && type !== "undefined") return false;
		return true;
	}
	if ("casing" in data) {
		const type = typeof data["casing"];
		if (type !== "string" && type !== "undefined") return false;
		return true;
	}
	if ("mode" in data) {
		if (data["mode"] !== "default" || data["mode"] !== "planetscale" || data["mode"] !== void 0) return false;
		return true;
	}
	if ("connection" in data) {
		const type = typeof data["connection"];
		if (type !== "string" && type !== "object" && type !== "undefined") return false;
		return true;
	}
	if ("client" in data) {
		const type = typeof data["client"];
		if (type !== "object" && type !== "function" && type !== "undefined") return false;
		return true;
	}
	if (Object.keys(data).length === 0) return true;
	return false;
}
const textDecoder = typeof TextDecoder === "undefined" ? null : new TextDecoder();

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/pg-core/table.js
const InlineForeignKeys$1 = Symbol.for("drizzle:PgInlineForeignKeys");
const EnableRLS = Symbol.for("drizzle:EnableRLS");
var PgTable = class extends Table {
	static [entityKind] = "PgTable";
	/** @internal */
	static Symbol = Object.assign({}, Table.Symbol, {
		InlineForeignKeys: InlineForeignKeys$1,
		EnableRLS
	});
	/**@internal */
	[InlineForeignKeys$1] = [];
	/** @internal */
	[EnableRLS] = false;
	/** @internal */
	[Table.Symbol.ExtraConfigBuilder] = void 0;
	/** @internal */
	[Table.Symbol.ExtraConfigColumns] = {};
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/pg-core/primary-keys.js
var PrimaryKeyBuilder = class {
	static [entityKind] = "PgPrimaryKeyBuilder";
	/** @internal */
	columns;
	/** @internal */
	name;
	constructor(columns, name) {
		this.columns = columns;
		this.name = name;
	}
	/** @internal */
	build(table) {
		return new PrimaryKey(table, this.columns, this.name);
	}
};
var PrimaryKey = class {
	constructor(table, columns, name) {
		this.table = table;
		this.columns = columns;
		this.name = name;
	}
	static [entityKind] = "PgPrimaryKey";
	columns;
	name;
	getName() {
		return this.name ?? `${this.table[PgTable.Symbol.Name]}_${this.columns.map((column) => column.name).join("_")}_pk`;
	}
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/sql/expressions/conditions.js
function bindIfParam(value, column) {
	if (isDriverValueEncoder(column) && !isSQLWrapper(value) && !is(value, Param) && !is(value, Placeholder) && !is(value, Column) && !is(value, Table) && !is(value, View)) return new Param(value, column);
	return value;
}
const eq = (left, right) => {
	return sql`${left} = ${bindIfParam(right, left)}`;
};
const ne = (left, right) => {
	return sql`${left} <> ${bindIfParam(right, left)}`;
};
function and(...unfilteredConditions) {
	const conditions = unfilteredConditions.filter((c) => c !== void 0);
	if (conditions.length === 0) return;
	if (conditions.length === 1) return new SQL(conditions);
	return new SQL([
		new StringChunk("("),
		sql.join(conditions, new StringChunk(" and ")),
		new StringChunk(")")
	]);
}
function or(...unfilteredConditions) {
	const conditions = unfilteredConditions.filter((c) => c !== void 0);
	if (conditions.length === 0) return;
	if (conditions.length === 1) return new SQL(conditions);
	return new SQL([
		new StringChunk("("),
		sql.join(conditions, new StringChunk(" or ")),
		new StringChunk(")")
	]);
}
function not(condition) {
	return sql`not ${condition}`;
}
const gt = (left, right) => {
	return sql`${left} > ${bindIfParam(right, left)}`;
};
const gte = (left, right) => {
	return sql`${left} >= ${bindIfParam(right, left)}`;
};
const lt = (left, right) => {
	return sql`${left} < ${bindIfParam(right, left)}`;
};
const lte = (left, right) => {
	return sql`${left} <= ${bindIfParam(right, left)}`;
};
function inArray(column, values) {
	if (Array.isArray(values)) {
		if (values.length === 0) return sql`false`;
		return sql`${column} in ${values.map((v) => bindIfParam(v, column))}`;
	}
	return sql`${column} in ${bindIfParam(values, column)}`;
}
function notInArray(column, values) {
	if (Array.isArray(values)) {
		if (values.length === 0) return sql`true`;
		return sql`${column} not in ${values.map((v) => bindIfParam(v, column))}`;
	}
	return sql`${column} not in ${bindIfParam(values, column)}`;
}
function isNull(value) {
	return sql`${value} is null`;
}
function isNotNull(value) {
	return sql`${value} is not null`;
}
function exists(subquery) {
	return sql`exists ${subquery}`;
}
function notExists(subquery) {
	return sql`not exists ${subquery}`;
}
function between(column, min, max) {
	return sql`${column} between ${bindIfParam(min, column)} and ${bindIfParam(max, column)}`;
}
function notBetween(column, min, max) {
	return sql`${column} not between ${bindIfParam(min, column)} and ${bindIfParam(max, column)}`;
}
function like(column, value) {
	return sql`${column} like ${value}`;
}
function notLike(column, value) {
	return sql`${column} not like ${value}`;
}
function ilike(column, value) {
	return sql`${column} ilike ${value}`;
}
function notIlike(column, value) {
	return sql`${column} not ilike ${value}`;
}

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/sql/expressions/select.js
function asc(column) {
	return sql`${column} asc`;
}
function desc(column) {
	return sql`${column} desc`;
}

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/relations.js
var Relation = class {
	constructor(sourceTable, referencedTable, relationName) {
		this.sourceTable = sourceTable;
		this.referencedTable = referencedTable;
		this.relationName = relationName;
		this.referencedTableName = referencedTable[Table.Symbol.Name];
	}
	static [entityKind] = "Relation";
	referencedTableName;
	fieldName;
};
var Relations = class {
	constructor(table, config) {
		this.table = table;
		this.config = config;
	}
	static [entityKind] = "Relations";
};
var One = class One extends Relation {
	constructor(sourceTable, referencedTable, config, isNullable) {
		super(sourceTable, referencedTable, config?.relationName);
		this.config = config;
		this.isNullable = isNullable;
	}
	static [entityKind] = "One";
	withFieldName(fieldName) {
		const relation = new One(this.sourceTable, this.referencedTable, this.config, this.isNullable);
		relation.fieldName = fieldName;
		return relation;
	}
};
var Many = class Many extends Relation {
	constructor(sourceTable, referencedTable, config) {
		super(sourceTable, referencedTable, config?.relationName);
		this.config = config;
	}
	static [entityKind] = "Many";
	withFieldName(fieldName) {
		const relation = new Many(this.sourceTable, this.referencedTable, this.config);
		relation.fieldName = fieldName;
		return relation;
	}
};
function getOperators() {
	return {
		and,
		between,
		eq,
		exists,
		gt,
		gte,
		ilike,
		inArray,
		isNull,
		isNotNull,
		like,
		lt,
		lte,
		ne,
		not,
		notBetween,
		notExists,
		notLike,
		notIlike,
		notInArray,
		or,
		sql
	};
}
function getOrderByOperators() {
	return {
		sql,
		asc,
		desc
	};
}
function extractTablesRelationalConfig(schema, configHelpers) {
	if (Object.keys(schema).length === 1 && "default" in schema && !is(schema["default"], Table)) schema = schema["default"];
	const tableNamesMap = {};
	const relationsBuffer = {};
	const tablesConfig = {};
	for (const [key, value] of Object.entries(schema)) if (is(value, Table)) {
		const dbName = getTableUniqueName(value);
		const bufferedRelations = relationsBuffer[dbName];
		tableNamesMap[dbName] = key;
		tablesConfig[key] = {
			tsName: key,
			dbName: value[Table.Symbol.Name],
			schema: value[Table.Symbol.Schema],
			columns: value[Table.Symbol.Columns],
			relations: bufferedRelations?.relations ?? {},
			primaryKey: bufferedRelations?.primaryKey ?? []
		};
		for (const column of Object.values(value[Table.Symbol.Columns])) if (column.primary) tablesConfig[key].primaryKey.push(column);
		const extraConfig = value[Table.Symbol.ExtraConfigBuilder]?.(value[Table.Symbol.ExtraConfigColumns]);
		if (extraConfig) {
			for (const configEntry of Object.values(extraConfig)) if (is(configEntry, PrimaryKeyBuilder)) tablesConfig[key].primaryKey.push(...configEntry.columns);
		}
	} else if (is(value, Relations)) {
		const dbName = getTableUniqueName(value.table);
		const tableName = tableNamesMap[dbName];
		const relations2 = value.config(configHelpers(value.table));
		let primaryKey;
		for (const [relationName, relation] of Object.entries(relations2)) if (tableName) {
			const tableConfig = tablesConfig[tableName];
			tableConfig.relations[relationName] = relation;
		} else {
			if (!(dbName in relationsBuffer)) relationsBuffer[dbName] = {
				relations: {},
				primaryKey
			};
			relationsBuffer[dbName].relations[relationName] = relation;
		}
	}
	return {
		tables: tablesConfig,
		tableNamesMap
	};
}
function relations(table, relations2) {
	return new Relations(table, (helpers) => Object.fromEntries(Object.entries(relations2(helpers)).map(([key, value]) => [key, value.withFieldName(key)])));
}
function createOne(sourceTable) {
	return function one(table, config) {
		return new One(sourceTable, table, config, config?.fields.reduce((res, f) => res && f.notNull, true) ?? false);
	};
}
function createMany(sourceTable) {
	return function many(referencedTable, config) {
		return new Many(sourceTable, referencedTable, config);
	};
}
function normalizeRelation(schema, tableNamesMap, relation) {
	if (is(relation, One) && relation.config) return {
		fields: relation.config.fields,
		references: relation.config.references
	};
	const referencedTableTsName = tableNamesMap[getTableUniqueName(relation.referencedTable)];
	if (!referencedTableTsName) throw new Error(`Table "${relation.referencedTable[Table.Symbol.Name]}" not found in schema`);
	const referencedTableConfig = schema[referencedTableTsName];
	if (!referencedTableConfig) throw new Error(`Table "${referencedTableTsName}" not found in schema`);
	const sourceTable = relation.sourceTable;
	const sourceTableTsName = tableNamesMap[getTableUniqueName(sourceTable)];
	if (!sourceTableTsName) throw new Error(`Table "${sourceTable[Table.Symbol.Name]}" not found in schema`);
	const reverseRelations = [];
	for (const referencedTableRelation of Object.values(referencedTableConfig.relations)) if (relation.relationName && relation !== referencedTableRelation && referencedTableRelation.relationName === relation.relationName || !relation.relationName && referencedTableRelation.referencedTable === relation.sourceTable) reverseRelations.push(referencedTableRelation);
	if (reverseRelations.length > 1) throw relation.relationName ? /* @__PURE__ */ new Error(`There are multiple relations with name "${relation.relationName}" in table "${referencedTableTsName}"`) : /* @__PURE__ */ new Error(`There are multiple relations between "${referencedTableTsName}" and "${relation.sourceTable[Table.Symbol.Name]}". Please specify relation name`);
	if (reverseRelations[0] && is(reverseRelations[0], One) && reverseRelations[0].config) return {
		fields: reverseRelations[0].config.references,
		references: reverseRelations[0].config.fields
	};
	throw new Error(`There is not enough information to infer relation "${sourceTableTsName}.${relation.fieldName}"`);
}
function createTableRelationsHelpers(sourceTable) {
	return {
		one: createOne(sourceTable),
		many: createMany(sourceTable)
	};
}
function mapRelationalRow(tablesConfig, tableConfig, row, buildQueryResultSelection, mapColumnValue = (value) => value) {
	const result = {};
	for (const [selectionItemIndex, selectionItem] of buildQueryResultSelection.entries()) if (selectionItem.isJson) {
		const relation = tableConfig.relations[selectionItem.tsKey];
		const rawSubRows = row[selectionItemIndex];
		const subRows = typeof rawSubRows === "string" ? JSON.parse(rawSubRows) : rawSubRows;
		result[selectionItem.tsKey] = is(relation, One) ? subRows && mapRelationalRow(tablesConfig, tablesConfig[selectionItem.relationTableTsKey], subRows, selectionItem.selection, mapColumnValue) : subRows.map((subRow) => mapRelationalRow(tablesConfig, tablesConfig[selectionItem.relationTableTsKey], subRow, selectionItem.selection, mapColumnValue));
	} else {
		const value = mapColumnValue(row[selectionItemIndex]);
		const field = selectionItem.field;
		let decoder;
		if (is(field, Column)) decoder = field;
		else if (is(field, SQL)) decoder = field.decoder;
		else decoder = field.sql.decoder;
		result[selectionItem.tsKey] = value === null ? null : decoder.mapFromDriverValue(value);
	}
	return result;
}

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/alias.js
var ColumnAliasProxyHandler = class {
	constructor(table) {
		this.table = table;
	}
	static [entityKind] = "ColumnAliasProxyHandler";
	get(columnObj, prop) {
		if (prop === "table") return this.table;
		return columnObj[prop];
	}
};
var TableAliasProxyHandler = class {
	constructor(alias, replaceOriginalName) {
		this.alias = alias;
		this.replaceOriginalName = replaceOriginalName;
	}
	static [entityKind] = "TableAliasProxyHandler";
	get(target, prop) {
		if (prop === Table.Symbol.IsAlias) return true;
		if (prop === Table.Symbol.Name) return this.alias;
		if (this.replaceOriginalName && prop === Table.Symbol.OriginalName) return this.alias;
		if (prop === ViewBaseConfig) return {
			...target[ViewBaseConfig],
			name: this.alias,
			isAlias: true
		};
		if (prop === Table.Symbol.Columns) {
			const columns = target[Table.Symbol.Columns];
			if (!columns) return columns;
			const proxiedColumns = {};
			Object.keys(columns).map((key) => {
				proxiedColumns[key] = new Proxy(columns[key], new ColumnAliasProxyHandler(new Proxy(target, this)));
			});
			return proxiedColumns;
		}
		const value = target[prop];
		if (is(value, Column)) return new Proxy(value, new ColumnAliasProxyHandler(new Proxy(target, this)));
		return value;
	}
};
var RelationTableAliasProxyHandler = class {
	constructor(alias) {
		this.alias = alias;
	}
	static [entityKind] = "RelationTableAliasProxyHandler";
	get(target, prop) {
		if (prop === "sourceTable") return aliasedTable(target.sourceTable, this.alias);
		return target[prop];
	}
};
function aliasedTable(table, tableAlias) {
	return new Proxy(table, new TableAliasProxyHandler(tableAlias, false));
}
function aliasedTableColumn(column, tableAlias) {
	return new Proxy(column, new ColumnAliasProxyHandler(new Proxy(column.table, new TableAliasProxyHandler(tableAlias, false))));
}
function mapColumnsInAliasedSQLToAlias(query, alias) {
	return new SQL.Aliased(mapColumnsInSQLToAlias(query.sql, alias), query.fieldAlias);
}
function mapColumnsInSQLToAlias(query, alias) {
	return sql.join(query.queryChunks.map((c) => {
		if (is(c, Column)) return aliasedTableColumn(c, alias);
		if (is(c, SQL)) return mapColumnsInSQLToAlias(c, alias);
		if (is(c, SQL.Aliased)) return mapColumnsInAliasedSQLToAlias(c, alias);
		return c;
	}));
}

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/selection-proxy.js
var SelectionProxyHandler = class SelectionProxyHandler {
	static [entityKind] = "SelectionProxyHandler";
	config;
	constructor(config) {
		this.config = { ...config };
	}
	get(subquery, prop) {
		if (prop === "_") return {
			...subquery["_"],
			selectedFields: new Proxy(subquery._.selectedFields, this)
		};
		if (prop === ViewBaseConfig) return {
			...subquery[ViewBaseConfig],
			selectedFields: new Proxy(subquery[ViewBaseConfig].selectedFields, this)
		};
		if (typeof prop === "symbol") return subquery[prop];
		const value = (is(subquery, Subquery) ? subquery._.selectedFields : is(subquery, View) ? subquery[ViewBaseConfig].selectedFields : subquery)[prop];
		if (is(value, SQL.Aliased)) {
			if (this.config.sqlAliasedBehavior === "sql" && !value.isSelectionField) return value.sql;
			const newValue = value.clone();
			newValue.isSelectionField = true;
			return newValue;
		}
		if (is(value, SQL)) {
			if (this.config.sqlBehavior === "sql") return value;
			throw new Error(`You tried to reference "${prop}" field from a subquery, which is a raw SQL field, but it doesn't have an alias declared. Please add an alias to the field using ".as('alias')" method.`);
		}
		if (is(value, Column)) {
			if (this.config.alias) return new Proxy(value, new ColumnAliasProxyHandler(new Proxy(value.table, new TableAliasProxyHandler(this.config.alias, this.config.replaceOriginalName ?? false))));
			return value;
		}
		if (typeof value !== "object" || value === null) return value;
		return new Proxy(value, new SelectionProxyHandler(this.config));
	}
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/query-promise.js
var QueryPromise = class {
	static [entityKind] = "QueryPromise";
	[Symbol.toStringTag] = "QueryPromise";
	catch(onRejected) {
		return this.then(void 0, onRejected);
	}
	finally(onFinally) {
		return this.then((value) => {
			onFinally?.();
			return value;
		}, (reason) => {
			onFinally?.();
			throw reason;
		});
	}
	then(onFulfilled, onRejected) {
		return this.execute().then(onFulfilled, onRejected);
	}
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/sqlite-core/foreign-keys.js
var ForeignKeyBuilder = class {
	static [entityKind] = "SQLiteForeignKeyBuilder";
	/** @internal */
	reference;
	/** @internal */
	_onUpdate;
	/** @internal */
	_onDelete;
	constructor(config, actions) {
		this.reference = () => {
			const { name, columns, foreignColumns } = config();
			return {
				name,
				columns,
				foreignTable: foreignColumns[0].table,
				foreignColumns
			};
		};
		if (actions) {
			this._onUpdate = actions.onUpdate;
			this._onDelete = actions.onDelete;
		}
	}
	onUpdate(action) {
		this._onUpdate = action;
		return this;
	}
	onDelete(action) {
		this._onDelete = action;
		return this;
	}
	/** @internal */
	build(table) {
		return new ForeignKey(table, this);
	}
};
var ForeignKey = class {
	constructor(table, builder) {
		this.table = table;
		this.reference = builder.reference;
		this.onUpdate = builder._onUpdate;
		this.onDelete = builder._onDelete;
	}
	static [entityKind] = "SQLiteForeignKey";
	reference;
	onUpdate;
	onDelete;
	getName() {
		const { name, columns, foreignColumns } = this.reference();
		const columnNames = columns.map((column) => column.name);
		const foreignColumnNames = foreignColumns.map((column) => column.name);
		const chunks = [
			this.table[TableName],
			...columnNames,
			foreignColumns[0].table[TableName],
			...foreignColumnNames
		];
		return name ?? `${chunks.join("_")}_fk`;
	}
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/sqlite-core/unique-constraint.js
function uniqueKeyName(table, columns) {
	return `${table[TableName]}_${columns.join("_")}_unique`;
}
function unique(name) {
	return new UniqueOnConstraintBuilder(name);
}
var UniqueConstraintBuilder = class {
	constructor(columns, name) {
		this.name = name;
		this.columns = columns;
	}
	static [entityKind] = "SQLiteUniqueConstraintBuilder";
	/** @internal */
	columns;
	/** @internal */
	build(table) {
		return new UniqueConstraint(table, this.columns, this.name);
	}
};
var UniqueOnConstraintBuilder = class {
	static [entityKind] = "SQLiteUniqueOnConstraintBuilder";
	/** @internal */
	name;
	constructor(name) {
		this.name = name;
	}
	on(...columns) {
		return new UniqueConstraintBuilder(columns, this.name);
	}
};
var UniqueConstraint = class {
	constructor(table, columns, name) {
		this.table = table;
		this.columns = columns;
		this.name = name ?? uniqueKeyName(this.table, this.columns.map((column) => column.name));
	}
	static [entityKind] = "SQLiteUniqueConstraint";
	columns;
	name;
	getName() {
		return this.name;
	}
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/sqlite-core/columns/common.js
var SQLiteColumnBuilder = class extends ColumnBuilder {
	static [entityKind] = "SQLiteColumnBuilder";
	foreignKeyConfigs = [];
	references(ref, actions = {}) {
		this.foreignKeyConfigs.push({
			ref,
			actions
		});
		return this;
	}
	unique(name) {
		this.config.isUnique = true;
		this.config.uniqueName = name;
		return this;
	}
	generatedAlwaysAs(as, config) {
		this.config.generated = {
			as,
			type: "always",
			mode: config?.mode ?? "virtual"
		};
		return this;
	}
	/** @internal */
	buildForeignKeys(column, table) {
		return this.foreignKeyConfigs.map(({ ref, actions }) => {
			return ((ref2, actions2) => {
				const builder = new ForeignKeyBuilder(() => {
					const foreignColumn = ref2();
					return {
						columns: [column],
						foreignColumns: [foreignColumn]
					};
				});
				if (actions2.onUpdate) builder.onUpdate(actions2.onUpdate);
				if (actions2.onDelete) builder.onDelete(actions2.onDelete);
				return builder.build(table);
			})(ref, actions);
		});
	}
};
var SQLiteColumn = class extends Column {
	constructor(table, config) {
		if (!config.uniqueName) config.uniqueName = uniqueKeyName(table, [config.name]);
		super(table, config);
		this.table = table;
	}
	static [entityKind] = "SQLiteColumn";
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/sqlite-core/columns/blob.js
var SQLiteBigIntBuilder = class extends SQLiteColumnBuilder {
	static [entityKind] = "SQLiteBigIntBuilder";
	constructor(name) {
		super(name, "bigint", "SQLiteBigInt");
	}
	/** @internal */
	build(table) {
		return new SQLiteBigInt(table, this.config);
	}
};
var SQLiteBigInt = class extends SQLiteColumn {
	static [entityKind] = "SQLiteBigInt";
	getSQLType() {
		return "blob";
	}
	mapFromDriverValue(value) {
		if (typeof Buffer !== "undefined" && Buffer.from) {
			const buf = Buffer.isBuffer(value) ? value : value instanceof ArrayBuffer ? Buffer.from(value) : value.buffer ? Buffer.from(value.buffer, value.byteOffset, value.byteLength) : Buffer.from(value);
			return BigInt(buf.toString("utf8"));
		}
		return BigInt(textDecoder.decode(value));
	}
	mapToDriverValue(value) {
		return Buffer.from(value.toString());
	}
};
var SQLiteBlobJsonBuilder = class extends SQLiteColumnBuilder {
	static [entityKind] = "SQLiteBlobJsonBuilder";
	constructor(name) {
		super(name, "json", "SQLiteBlobJson");
	}
	/** @internal */
	build(table) {
		return new SQLiteBlobJson(table, this.config);
	}
};
var SQLiteBlobJson = class extends SQLiteColumn {
	static [entityKind] = "SQLiteBlobJson";
	getSQLType() {
		return "blob";
	}
	mapFromDriverValue(value) {
		if (typeof Buffer !== "undefined" && Buffer.from) {
			const buf = Buffer.isBuffer(value) ? value : value instanceof ArrayBuffer ? Buffer.from(value) : value.buffer ? Buffer.from(value.buffer, value.byteOffset, value.byteLength) : Buffer.from(value);
			return JSON.parse(buf.toString("utf8"));
		}
		return JSON.parse(textDecoder.decode(value));
	}
	mapToDriverValue(value) {
		return Buffer.from(JSON.stringify(value));
	}
};
var SQLiteBlobBufferBuilder = class extends SQLiteColumnBuilder {
	static [entityKind] = "SQLiteBlobBufferBuilder";
	constructor(name) {
		super(name, "buffer", "SQLiteBlobBuffer");
	}
	/** @internal */
	build(table) {
		return new SQLiteBlobBuffer(table, this.config);
	}
};
var SQLiteBlobBuffer = class extends SQLiteColumn {
	static [entityKind] = "SQLiteBlobBuffer";
	mapFromDriverValue(value) {
		if (Buffer.isBuffer(value)) return value;
		return Buffer.from(value);
	}
	getSQLType() {
		return "blob";
	}
};
function blob(a, b) {
	const { name, config } = getColumnNameAndConfig(a, b);
	if (config?.mode === "json") return new SQLiteBlobJsonBuilder(name);
	if (config?.mode === "bigint") return new SQLiteBigIntBuilder(name);
	return new SQLiteBlobBufferBuilder(name);
}

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/sqlite-core/columns/custom.js
var SQLiteCustomColumnBuilder = class extends SQLiteColumnBuilder {
	static [entityKind] = "SQLiteCustomColumnBuilder";
	constructor(name, fieldConfig, customTypeParams) {
		super(name, "custom", "SQLiteCustomColumn");
		this.config.fieldConfig = fieldConfig;
		this.config.customTypeParams = customTypeParams;
	}
	/** @internal */
	build(table) {
		return new SQLiteCustomColumn(table, this.config);
	}
};
var SQLiteCustomColumn = class extends SQLiteColumn {
	static [entityKind] = "SQLiteCustomColumn";
	sqlName;
	mapTo;
	mapFrom;
	constructor(table, config) {
		super(table, config);
		this.sqlName = config.customTypeParams.dataType(config.fieldConfig);
		this.mapTo = config.customTypeParams.toDriver;
		this.mapFrom = config.customTypeParams.fromDriver;
	}
	getSQLType() {
		return this.sqlName;
	}
	mapFromDriverValue(value) {
		return typeof this.mapFrom === "function" ? this.mapFrom(value) : value;
	}
	mapToDriverValue(value) {
		return typeof this.mapTo === "function" ? this.mapTo(value) : value;
	}
};
function customType(customTypeParams) {
	return (a, b) => {
		const { name, config } = getColumnNameAndConfig(a, b);
		return new SQLiteCustomColumnBuilder(name, config, customTypeParams);
	};
}

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/sqlite-core/columns/integer.js
var SQLiteBaseIntegerBuilder = class extends SQLiteColumnBuilder {
	static [entityKind] = "SQLiteBaseIntegerBuilder";
	constructor(name, dataType, columnType) {
		super(name, dataType, columnType);
		this.config.autoIncrement = false;
	}
	primaryKey(config) {
		if (config?.autoIncrement) this.config.autoIncrement = true;
		this.config.hasDefault = true;
		return super.primaryKey();
	}
};
var SQLiteBaseInteger = class extends SQLiteColumn {
	static [entityKind] = "SQLiteBaseInteger";
	autoIncrement = this.config.autoIncrement;
	getSQLType() {
		return "integer";
	}
};
var SQLiteIntegerBuilder = class extends SQLiteBaseIntegerBuilder {
	static [entityKind] = "SQLiteIntegerBuilder";
	constructor(name) {
		super(name, "number", "SQLiteInteger");
	}
	build(table) {
		return new SQLiteInteger(table, this.config);
	}
};
var SQLiteInteger = class extends SQLiteBaseInteger {
	static [entityKind] = "SQLiteInteger";
};
var SQLiteTimestampBuilder = class extends SQLiteBaseIntegerBuilder {
	static [entityKind] = "SQLiteTimestampBuilder";
	constructor(name, mode) {
		super(name, "date", "SQLiteTimestamp");
		this.config.mode = mode;
	}
	/**
	* @deprecated Use `default()` with your own expression instead.
	*
	* Adds `DEFAULT (cast((julianday('now') - 2440587.5)*86400000 as integer))` to the column, which is the current epoch timestamp in milliseconds.
	*/
	defaultNow() {
		return this.default(sql`(cast((julianday('now') - 2440587.5)*86400000 as integer))`);
	}
	build(table) {
		return new SQLiteTimestamp(table, this.config);
	}
};
var SQLiteTimestamp = class extends SQLiteBaseInteger {
	static [entityKind] = "SQLiteTimestamp";
	mode = this.config.mode;
	mapFromDriverValue(value) {
		if (this.config.mode === "timestamp") return /* @__PURE__ */ new Date(value * 1e3);
		return new Date(value);
	}
	mapToDriverValue(value) {
		const unix = value.getTime();
		if (this.config.mode === "timestamp") return Math.floor(unix / 1e3);
		return unix;
	}
};
var SQLiteBooleanBuilder = class extends SQLiteBaseIntegerBuilder {
	static [entityKind] = "SQLiteBooleanBuilder";
	constructor(name, mode) {
		super(name, "boolean", "SQLiteBoolean");
		this.config.mode = mode;
	}
	build(table) {
		return new SQLiteBoolean(table, this.config);
	}
};
var SQLiteBoolean = class extends SQLiteBaseInteger {
	static [entityKind] = "SQLiteBoolean";
	mode = this.config.mode;
	mapFromDriverValue(value) {
		return Number(value) === 1;
	}
	mapToDriverValue(value) {
		return value ? 1 : 0;
	}
};
function integer(a, b) {
	const { name, config } = getColumnNameAndConfig(a, b);
	if (config?.mode === "timestamp" || config?.mode === "timestamp_ms") return new SQLiteTimestampBuilder(name, config.mode);
	if (config?.mode === "boolean") return new SQLiteBooleanBuilder(name, config.mode);
	return new SQLiteIntegerBuilder(name);
}

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/sqlite-core/columns/numeric.js
var SQLiteNumericBuilder = class extends SQLiteColumnBuilder {
	static [entityKind] = "SQLiteNumericBuilder";
	constructor(name) {
		super(name, "string", "SQLiteNumeric");
	}
	/** @internal */
	build(table) {
		return new SQLiteNumeric(table, this.config);
	}
};
var SQLiteNumeric = class extends SQLiteColumn {
	static [entityKind] = "SQLiteNumeric";
	mapFromDriverValue(value) {
		if (typeof value === "string") return value;
		return String(value);
	}
	getSQLType() {
		return "numeric";
	}
};
var SQLiteNumericNumberBuilder = class extends SQLiteColumnBuilder {
	static [entityKind] = "SQLiteNumericNumberBuilder";
	constructor(name) {
		super(name, "number", "SQLiteNumericNumber");
	}
	/** @internal */
	build(table) {
		return new SQLiteNumericNumber(table, this.config);
	}
};
var SQLiteNumericNumber = class extends SQLiteColumn {
	static [entityKind] = "SQLiteNumericNumber";
	mapFromDriverValue(value) {
		if (typeof value === "number") return value;
		return Number(value);
	}
	mapToDriverValue = String;
	getSQLType() {
		return "numeric";
	}
};
var SQLiteNumericBigIntBuilder = class extends SQLiteColumnBuilder {
	static [entityKind] = "SQLiteNumericBigIntBuilder";
	constructor(name) {
		super(name, "bigint", "SQLiteNumericBigInt");
	}
	/** @internal */
	build(table) {
		return new SQLiteNumericBigInt(table, this.config);
	}
};
var SQLiteNumericBigInt = class extends SQLiteColumn {
	static [entityKind] = "SQLiteNumericBigInt";
	mapFromDriverValue = BigInt;
	mapToDriverValue = String;
	getSQLType() {
		return "numeric";
	}
};
function numeric(a, b) {
	const { name, config } = getColumnNameAndConfig(a, b);
	const mode = config?.mode;
	return mode === "number" ? new SQLiteNumericNumberBuilder(name) : mode === "bigint" ? new SQLiteNumericBigIntBuilder(name) : new SQLiteNumericBuilder(name);
}

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/sqlite-core/columns/real.js
var SQLiteRealBuilder = class extends SQLiteColumnBuilder {
	static [entityKind] = "SQLiteRealBuilder";
	constructor(name) {
		super(name, "number", "SQLiteReal");
	}
	/** @internal */
	build(table) {
		return new SQLiteReal(table, this.config);
	}
};
var SQLiteReal = class extends SQLiteColumn {
	static [entityKind] = "SQLiteReal";
	getSQLType() {
		return "real";
	}
};
function real(name) {
	return new SQLiteRealBuilder(name ?? "");
}

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/sqlite-core/columns/text.js
var SQLiteTextBuilder = class extends SQLiteColumnBuilder {
	static [entityKind] = "SQLiteTextBuilder";
	constructor(name, config) {
		super(name, "string", "SQLiteText");
		this.config.enumValues = config.enum;
		this.config.length = config.length;
	}
	/** @internal */
	build(table) {
		return new SQLiteText(table, this.config);
	}
};
var SQLiteText = class extends SQLiteColumn {
	static [entityKind] = "SQLiteText";
	enumValues = this.config.enumValues;
	length = this.config.length;
	constructor(table, config) {
		super(table, config);
	}
	getSQLType() {
		return `text${this.config.length ? `(${this.config.length})` : ""}`;
	}
};
var SQLiteTextJsonBuilder = class extends SQLiteColumnBuilder {
	static [entityKind] = "SQLiteTextJsonBuilder";
	constructor(name) {
		super(name, "json", "SQLiteTextJson");
	}
	/** @internal */
	build(table) {
		return new SQLiteTextJson(table, this.config);
	}
};
var SQLiteTextJson = class extends SQLiteColumn {
	static [entityKind] = "SQLiteTextJson";
	getSQLType() {
		return "text";
	}
	mapFromDriverValue(value) {
		return JSON.parse(value);
	}
	mapToDriverValue(value) {
		return JSON.stringify(value);
	}
};
function text(a, b = {}) {
	const { name, config } = getColumnNameAndConfig(a, b);
	if (config.mode === "json") return new SQLiteTextJsonBuilder(name);
	return new SQLiteTextBuilder(name, config);
}

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/sqlite-core/columns/all.js
function getSQLiteColumnBuilders() {
	return {
		blob,
		customType,
		integer,
		numeric,
		real,
		text
	};
}

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/sqlite-core/table.js
const InlineForeignKeys = Symbol.for("drizzle:SQLiteInlineForeignKeys");
var SQLiteTable = class extends Table {
	static [entityKind] = "SQLiteTable";
	/** @internal */
	static Symbol = Object.assign({}, Table.Symbol, { InlineForeignKeys });
	/** @internal */
	[Table.Symbol.Columns];
	/** @internal */
	[InlineForeignKeys] = [];
	/** @internal */
	[Table.Symbol.ExtraConfigBuilder] = void 0;
};
function sqliteTableBase(name, columns, extraConfig, schema, baseName = name) {
	const rawTable = new SQLiteTable(name, schema, baseName);
	const parsedColumns = typeof columns === "function" ? columns(getSQLiteColumnBuilders()) : columns;
	const builtColumns = Object.fromEntries(Object.entries(parsedColumns).map(([name2, colBuilderBase]) => {
		const colBuilder = colBuilderBase;
		colBuilder.setName(name2);
		const column = colBuilder.build(rawTable);
		rawTable[InlineForeignKeys].push(...colBuilder.buildForeignKeys(column, rawTable));
		return [name2, column];
	}));
	const table = Object.assign(rawTable, builtColumns);
	table[Table.Symbol.Columns] = builtColumns;
	table[Table.Symbol.ExtraConfigColumns] = builtColumns;
	if (extraConfig) table[SQLiteTable.Symbol.ExtraConfigBuilder] = extraConfig;
	return table;
}
const sqliteTable = (name, columns, extraConfig) => {
	return sqliteTableBase(name, columns, extraConfig);
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/sqlite-core/indexes.js
var IndexBuilderOn = class {
	constructor(name, unique) {
		this.name = name;
		this.unique = unique;
	}
	static [entityKind] = "SQLiteIndexBuilderOn";
	on(...columns) {
		return new IndexBuilder(this.name, columns, this.unique);
	}
};
var IndexBuilder = class {
	static [entityKind] = "SQLiteIndexBuilder";
	/** @internal */
	config;
	constructor(name, columns, unique) {
		this.config = {
			name,
			columns,
			unique,
			where: void 0
		};
	}
	/**
	* Condition for partial index.
	*/
	where(condition) {
		this.config.where = condition;
		return this;
	}
	/** @internal */
	build(table) {
		return new Index(this.config, table);
	}
};
var Index = class {
	static [entityKind] = "SQLiteIndex";
	config;
	constructor(config, table) {
		this.config = {
			...config,
			table
		};
	}
};
function index(name) {
	return new IndexBuilderOn(name, false);
}

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/sqlite-core/utils.js
function extractUsedTable(table) {
	if (is(table, SQLiteTable)) return [`${table[Table.Symbol.BaseName]}`];
	if (is(table, Subquery)) return table._.usedTables ?? [];
	if (is(table, SQL)) return table.usedTables ?? [];
	return [];
}

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/sqlite-core/query-builders/delete.js
var SQLiteDeleteBase = class extends QueryPromise {
	constructor(table, session, dialect, withList) {
		super();
		this.table = table;
		this.session = session;
		this.dialect = dialect;
		this.config = {
			table,
			withList
		};
	}
	static [entityKind] = "SQLiteDelete";
	/** @internal */
	config;
	/**
	* Adds a `where` clause to the query.
	*
	* Calling this method will delete only those rows that fulfill a specified condition.
	*
	* See docs: {@link https://orm.drizzle.team/docs/delete}
	*
	* @param where the `where` clause.
	*
	* @example
	* You can use conditional operators and `sql function` to filter the rows to be deleted.
	*
	* ```ts
	* // Delete all cars with green color
	* db.delete(cars).where(eq(cars.color, 'green'));
	* // or
	* db.delete(cars).where(sql`${cars.color} = 'green'`)
	* ```
	*
	* You can logically combine conditional operators with `and()` and `or()` operators:
	*
	* ```ts
	* // Delete all BMW cars with a green color
	* db.delete(cars).where(and(eq(cars.color, 'green'), eq(cars.brand, 'BMW')));
	*
	* // Delete all cars with the green or blue color
	* db.delete(cars).where(or(eq(cars.color, 'green'), eq(cars.color, 'blue')));
	* ```
	*/
	where(where) {
		this.config.where = where;
		return this;
	}
	orderBy(...columns) {
		if (typeof columns[0] === "function") {
			const orderBy = columns[0](new Proxy(this.config.table[Table.Symbol.Columns], new SelectionProxyHandler({
				sqlAliasedBehavior: "alias",
				sqlBehavior: "sql"
			})));
			const orderByArray = Array.isArray(orderBy) ? orderBy : [orderBy];
			this.config.orderBy = orderByArray;
		} else {
			const orderByArray = columns;
			this.config.orderBy = orderByArray;
		}
		return this;
	}
	limit(limit) {
		this.config.limit = limit;
		return this;
	}
	returning(fields = this.table[SQLiteTable.Symbol.Columns]) {
		this.config.returning = orderSelectedFields(fields);
		return this;
	}
	/** @internal */
	getSQL() {
		return this.dialect.buildDeleteQuery(this.config);
	}
	toSQL() {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}
	/** @internal */
	_prepare(isOneTimeQuery = true) {
		return this.session[isOneTimeQuery ? "prepareOneTimeQuery" : "prepareQuery"](this.dialect.sqlToQuery(this.getSQL()), this.config.returning, this.config.returning ? "all" : "run", true, void 0, {
			type: "delete",
			tables: extractUsedTable(this.config.table)
		});
	}
	prepare() {
		return this._prepare(false);
	}
	run = (placeholderValues) => {
		return this._prepare().run(placeholderValues);
	};
	all = (placeholderValues) => {
		return this._prepare().all(placeholderValues);
	};
	get = (placeholderValues) => {
		return this._prepare().get(placeholderValues);
	};
	values = (placeholderValues) => {
		return this._prepare().values(placeholderValues);
	};
	async execute(placeholderValues) {
		return this._prepare().execute(placeholderValues);
	}
	$dynamic() {
		return this;
	}
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/casing.js
function toSnakeCase(input) {
	return (input.replace(/['\u2019]/g, "").match(/[\da-z]+|[A-Z]+(?![a-z])|[A-Z][\da-z]+/g) ?? []).map((word) => word.toLowerCase()).join("_");
}
function toCamelCase(input) {
	return (input.replace(/['\u2019]/g, "").match(/[\da-z]+|[A-Z]+(?![a-z])|[A-Z][\da-z]+/g) ?? []).reduce((acc, word, i) => {
		return acc + (i === 0 ? word.toLowerCase() : `${word[0].toUpperCase()}${word.slice(1)}`);
	}, "");
}
function noopCase(input) {
	return input;
}
var CasingCache = class {
	static [entityKind] = "CasingCache";
	/** @internal */
	cache = {};
	cachedTables = {};
	convert;
	constructor(casing) {
		this.convert = casing === "snake_case" ? toSnakeCase : casing === "camelCase" ? toCamelCase : noopCase;
	}
	getColumnCasing(column) {
		if (!column.keyAsName) return column.name;
		const key = `${column.table[Table.Symbol.Schema] ?? "public"}.${column.table[Table.Symbol.OriginalName]}.${column.name}`;
		if (!this.cache[key]) this.cacheTable(column.table);
		return this.cache[key];
	}
	cacheTable(table) {
		const tableKey = `${table[Table.Symbol.Schema] ?? "public"}.${table[Table.Symbol.OriginalName]}`;
		if (!this.cachedTables[tableKey]) {
			for (const column of Object.values(table[Table.Symbol.Columns])) {
				const columnKey = `${tableKey}.${column.name}`;
				this.cache[columnKey] = this.convert(column.name);
			}
			this.cachedTables[tableKey] = true;
		}
	}
	clearCache() {
		this.cache = {};
		this.cachedTables = {};
	}
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/errors.js
var DrizzleError = class extends Error {
	static [entityKind] = "DrizzleError";
	constructor({ message, cause }) {
		super(message);
		this.name = "DrizzleError";
		this.cause = cause;
	}
};
var DrizzleQueryError = class DrizzleQueryError extends Error {
	constructor(query, params, cause) {
		super(`Failed query: ${query}
params: ${params}`);
		this.query = query;
		this.params = params;
		this.cause = cause;
		Error.captureStackTrace(this, DrizzleQueryError);
		if (cause) this.cause = cause;
	}
};
var TransactionRollbackError = class extends DrizzleError {
	static [entityKind] = "TransactionRollbackError";
	constructor() {
		super({ message: "Rollback" });
	}
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/sqlite-core/view-base.js
var SQLiteViewBase = class extends View {
	static [entityKind] = "SQLiteViewBase";
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/sqlite-core/dialect.js
var SQLiteDialect = class {
	static [entityKind] = "SQLiteDialect";
	/** @internal */
	casing;
	constructor(config) {
		this.casing = new CasingCache(config?.casing);
	}
	escapeName(name) {
		return `"${name.replace(/"/g, "\"\"")}"`;
	}
	escapeParam(_num) {
		return "?";
	}
	escapeString(str) {
		return `'${str.replace(/'/g, "''")}'`;
	}
	buildWithCTE(queries) {
		if (!queries?.length) return void 0;
		const withSqlChunks = [sql`with `];
		for (const [i, w] of queries.entries()) {
			withSqlChunks.push(sql`${sql.identifier(w._.alias)} as (${w._.sql})`);
			if (i < queries.length - 1) withSqlChunks.push(sql`, `);
		}
		withSqlChunks.push(sql` `);
		return sql.join(withSqlChunks);
	}
	buildDeleteQuery({ table, where, returning, withList, limit, orderBy }) {
		const withSql = this.buildWithCTE(withList);
		const returningSql = returning ? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}` : void 0;
		return sql`${withSql}delete from ${table}${where ? sql` where ${where}` : void 0}${returningSql}${this.buildOrderBy(orderBy)}${this.buildLimit(limit)}`;
	}
	buildUpdateSet(table, set) {
		const tableColumns = table[Table.Symbol.Columns];
		const columnNames = Object.keys(tableColumns).filter((colName) => set[colName] !== void 0 || tableColumns[colName]?.onUpdateFn !== void 0);
		const setSize = columnNames.length;
		return sql.join(columnNames.flatMap((colName, i) => {
			const col = tableColumns[colName];
			const onUpdateFnResult = col.onUpdateFn?.();
			const value = set[colName] ?? (is(onUpdateFnResult, SQL) ? onUpdateFnResult : sql.param(onUpdateFnResult, col));
			const res = sql`${sql.identifier(this.casing.getColumnCasing(col))} = ${value}`;
			if (i < setSize - 1) return [res, sql.raw(", ")];
			return [res];
		}));
	}
	buildUpdateQuery({ table, set, where, returning, withList, joins, from, limit, orderBy }) {
		const withSql = this.buildWithCTE(withList);
		const setSql = this.buildUpdateSet(table, set);
		const fromSql = from && sql.join([sql.raw(" from "), this.buildFromTable(from)]);
		const joinsSql = this.buildJoins(joins);
		const returningSql = returning ? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}` : void 0;
		return sql`${withSql}update ${table} set ${setSql}${fromSql}${joinsSql}${where ? sql` where ${where}` : void 0}${returningSql}${this.buildOrderBy(orderBy)}${this.buildLimit(limit)}`;
	}
	/**
	* Builds selection SQL with provided fields/expressions
	*
	* Examples:
	*
	* `select <selection> from`
	*
	* `insert ... returning <selection>`
	*
	* If `isSingleTable` is true, then columns won't be prefixed with table name
	*/
	buildSelection(fields, { isSingleTable = false } = {}) {
		const columnsLen = fields.length;
		const chunks = fields.flatMap(({ field }, i) => {
			const chunk = [];
			if (is(field, SQL.Aliased) && field.isSelectionField) chunk.push(sql.identifier(field.fieldAlias));
			else if (is(field, SQL.Aliased) || is(field, SQL)) {
				const query = is(field, SQL.Aliased) ? field.sql : field;
				if (isSingleTable) chunk.push(new SQL(query.queryChunks.map((c) => {
					if (is(c, Column)) return sql.identifier(this.casing.getColumnCasing(c));
					return c;
				})));
				else chunk.push(query);
				if (is(field, SQL.Aliased)) chunk.push(sql` as ${sql.identifier(field.fieldAlias)}`);
			} else if (is(field, Column)) {
				const tableName = field.table[Table.Symbol.Name];
				if (field.columnType === "SQLiteNumericBigInt") if (isSingleTable) chunk.push(sql`cast(${sql.identifier(this.casing.getColumnCasing(field))} as text)`);
				else chunk.push(sql`cast(${sql.identifier(tableName)}.${sql.identifier(this.casing.getColumnCasing(field))} as text)`);
				else if (isSingleTable) chunk.push(sql.identifier(this.casing.getColumnCasing(field)));
				else chunk.push(sql`${sql.identifier(tableName)}.${sql.identifier(this.casing.getColumnCasing(field))}`);
			} else if (is(field, Subquery)) {
				const entries = Object.entries(field._.selectedFields);
				if (entries.length === 1) {
					const entry = entries[0][1];
					const fieldDecoder = is(entry, SQL) ? entry.decoder : is(entry, Column) ? { mapFromDriverValue: (v) => entry.mapFromDriverValue(v) } : entry.sql.decoder;
					if (fieldDecoder) field._.sql.decoder = fieldDecoder;
				}
				chunk.push(field);
			}
			if (i < columnsLen - 1) chunk.push(sql`, `);
			return chunk;
		});
		return sql.join(chunks);
	}
	buildJoins(joins) {
		if (!joins || joins.length === 0) return;
		const joinsArray = [];
		if (joins) for (const [index, joinMeta] of joins.entries()) {
			if (index === 0) joinsArray.push(sql` `);
			const table = joinMeta.table;
			const onSql = joinMeta.on ? sql` on ${joinMeta.on}` : void 0;
			if (is(table, SQLiteTable)) {
				const tableName = table[SQLiteTable.Symbol.Name];
				const tableSchema = table[SQLiteTable.Symbol.Schema];
				const origTableName = table[SQLiteTable.Symbol.OriginalName];
				const alias = tableName === origTableName ? void 0 : joinMeta.alias;
				joinsArray.push(sql`${sql.raw(joinMeta.joinType)} join ${tableSchema ? sql`${sql.identifier(tableSchema)}.` : void 0}${sql.identifier(origTableName)}${alias && sql` ${sql.identifier(alias)}`}${onSql}`);
			} else joinsArray.push(sql`${sql.raw(joinMeta.joinType)} join ${table}${onSql}`);
			if (index < joins.length - 1) joinsArray.push(sql` `);
		}
		return sql.join(joinsArray);
	}
	buildLimit(limit) {
		return typeof limit === "object" || typeof limit === "number" && limit >= 0 ? sql` limit ${limit}` : void 0;
	}
	buildOrderBy(orderBy) {
		const orderByList = [];
		if (orderBy) for (const [index, orderByValue] of orderBy.entries()) {
			orderByList.push(orderByValue);
			if (index < orderBy.length - 1) orderByList.push(sql`, `);
		}
		return orderByList.length > 0 ? sql` order by ${sql.join(orderByList)}` : void 0;
	}
	buildFromTable(table) {
		if (is(table, Table) && table[Table.Symbol.IsAlias]) return sql`${sql`${sql.identifier(table[Table.Symbol.Schema] ?? "")}.`.if(table[Table.Symbol.Schema])}${sql.identifier(table[Table.Symbol.OriginalName])} ${sql.identifier(table[Table.Symbol.Name])}`;
		return table;
	}
	buildSelectQuery({ withList, fields, fieldsFlat, where, having, table, joins, orderBy, groupBy, limit, offset, distinct, setOperators }) {
		const fieldsList = fieldsFlat ?? orderSelectedFields(fields);
		for (const f of fieldsList) if (is(f.field, Column) && getTableName(f.field.table) !== (is(table, Subquery) ? table._.alias : is(table, SQLiteViewBase) ? table[ViewBaseConfig].name : is(table, SQL) ? void 0 : getTableName(table)) && !((table2) => joins?.some(({ alias }) => alias === (table2[Table.Symbol.IsAlias] ? getTableName(table2) : table2[Table.Symbol.BaseName])))(f.field.table)) {
			const tableName = getTableName(f.field.table);
			throw new Error(`Your "${f.path.join("->")}" field references a column "${tableName}"."${f.field.name}", but the table "${tableName}" is not part of the query! Did you forget to join it?`);
		}
		const isSingleTable = !joins || joins.length === 0;
		const withSql = this.buildWithCTE(withList);
		const distinctSql = distinct ? sql` distinct` : void 0;
		const selection = this.buildSelection(fieldsList, { isSingleTable });
		const tableSql = this.buildFromTable(table);
		const joinsSql = this.buildJoins(joins);
		const whereSql = where ? sql` where ${where}` : void 0;
		const havingSql = having ? sql` having ${having}` : void 0;
		const groupByList = [];
		if (groupBy) for (const [index, groupByValue] of groupBy.entries()) {
			groupByList.push(groupByValue);
			if (index < groupBy.length - 1) groupByList.push(sql`, `);
		}
		const finalQuery = sql`${withSql}select${distinctSql} ${selection} from ${tableSql}${joinsSql}${whereSql}${groupByList.length > 0 ? sql` group by ${sql.join(groupByList)}` : void 0}${havingSql}${this.buildOrderBy(orderBy)}${this.buildLimit(limit)}${offset ? sql` offset ${offset}` : void 0}`;
		if (setOperators.length > 0) return this.buildSetOperations(finalQuery, setOperators);
		return finalQuery;
	}
	buildSetOperations(leftSelect, setOperators) {
		const [setOperator, ...rest] = setOperators;
		if (!setOperator) throw new Error("Cannot pass undefined values to any set operator");
		if (rest.length === 0) return this.buildSetOperationQuery({
			leftSelect,
			setOperator
		});
		return this.buildSetOperations(this.buildSetOperationQuery({
			leftSelect,
			setOperator
		}), rest);
	}
	buildSetOperationQuery({ leftSelect, setOperator: { type, isAll, rightSelect, limit, orderBy, offset } }) {
		const leftChunk = sql`${leftSelect.getSQL()} `;
		const rightChunk = sql`${rightSelect.getSQL()}`;
		let orderBySql;
		if (orderBy && orderBy.length > 0) {
			const orderByValues = [];
			for (const singleOrderBy of orderBy) if (is(singleOrderBy, SQLiteColumn)) orderByValues.push(sql.identifier(singleOrderBy.name));
			else if (is(singleOrderBy, SQL)) {
				for (let i = 0; i < singleOrderBy.queryChunks.length; i++) {
					const chunk = singleOrderBy.queryChunks[i];
					if (is(chunk, SQLiteColumn)) singleOrderBy.queryChunks[i] = sql.identifier(this.casing.getColumnCasing(chunk));
				}
				orderByValues.push(sql`${singleOrderBy}`);
			} else orderByValues.push(sql`${singleOrderBy}`);
			orderBySql = sql` order by ${sql.join(orderByValues, sql`, `)}`;
		}
		const limitSql = typeof limit === "object" || typeof limit === "number" && limit >= 0 ? sql` limit ${limit}` : void 0;
		const operatorChunk = sql.raw(`${type} ${isAll ? "all " : ""}`);
		const offsetSql = offset ? sql` offset ${offset}` : void 0;
		return sql`${leftChunk}${operatorChunk}${rightChunk}${orderBySql}${limitSql}${offsetSql}`;
	}
	buildInsertQuery({ table, values: valuesOrSelect, onConflict, returning, withList, select }) {
		const valuesSqlList = [];
		const columns = table[Table.Symbol.Columns];
		const colEntries = Object.entries(columns).filter(([_, col]) => !col.shouldDisableInsert());
		const insertOrder = colEntries.map(([, column]) => sql.identifier(this.casing.getColumnCasing(column)));
		if (select) {
			const select2 = valuesOrSelect;
			if (is(select2, SQL)) valuesSqlList.push(select2);
			else valuesSqlList.push(select2.getSQL());
		} else {
			const values = valuesOrSelect;
			valuesSqlList.push(sql.raw("values "));
			for (const [valueIndex, value] of values.entries()) {
				const valueList = [];
				for (const [fieldName, col] of colEntries) {
					const colValue = value[fieldName];
					if (colValue === void 0 || is(colValue, Param) && colValue.value === void 0) {
						let defaultValue;
						if (col.default !== null && col.default !== void 0) defaultValue = is(col.default, SQL) ? col.default : sql.param(col.default, col);
						else if (col.defaultFn !== void 0) {
							const defaultFnResult = col.defaultFn();
							defaultValue = is(defaultFnResult, SQL) ? defaultFnResult : sql.param(defaultFnResult, col);
						} else if (!col.default && col.onUpdateFn !== void 0) {
							const onUpdateFnResult = col.onUpdateFn();
							defaultValue = is(onUpdateFnResult, SQL) ? onUpdateFnResult : sql.param(onUpdateFnResult, col);
						} else defaultValue = sql`null`;
						valueList.push(defaultValue);
					} else valueList.push(colValue);
				}
				valuesSqlList.push(valueList);
				if (valueIndex < values.length - 1) valuesSqlList.push(sql`, `);
			}
		}
		const withSql = this.buildWithCTE(withList);
		const valuesSql = sql.join(valuesSqlList);
		const returningSql = returning ? sql` returning ${this.buildSelection(returning, { isSingleTable: true })}` : void 0;
		return sql`${withSql}insert into ${table} ${insertOrder} ${valuesSql}${onConflict?.length ? sql.join(onConflict) : void 0}${returningSql}`;
	}
	sqlToQuery(sql2, invokeSource) {
		return sql2.toQuery({
			casing: this.casing,
			escapeName: this.escapeName,
			escapeParam: this.escapeParam,
			escapeString: this.escapeString,
			invokeSource
		});
	}
	buildRelationalQuery({ fullSchema, schema, tableNamesMap, table, tableConfig, queryConfig: config, tableAlias, nestedQueryRelation, joinOn }) {
		let selection = [];
		let limit, offset, orderBy = [], where;
		const joins = [];
		if (config === true) selection = Object.entries(tableConfig.columns).map(([key, value]) => ({
			dbKey: value.name,
			tsKey: key,
			field: aliasedTableColumn(value, tableAlias),
			relationTableTsKey: void 0,
			isJson: false,
			selection: []
		}));
		else {
			const aliasedColumns = Object.fromEntries(Object.entries(tableConfig.columns).map(([key, value]) => [key, aliasedTableColumn(value, tableAlias)]));
			if (config.where) {
				const whereSql = typeof config.where === "function" ? config.where(aliasedColumns, getOperators()) : config.where;
				where = whereSql && mapColumnsInSQLToAlias(whereSql, tableAlias);
			}
			const fieldsSelection = [];
			let selectedColumns = [];
			if (config.columns) {
				let isIncludeMode = false;
				for (const [field, value] of Object.entries(config.columns)) {
					if (value === void 0) continue;
					if (field in tableConfig.columns) {
						if (!isIncludeMode && value === true) isIncludeMode = true;
						selectedColumns.push(field);
					}
				}
				if (selectedColumns.length > 0) selectedColumns = isIncludeMode ? selectedColumns.filter((c) => config.columns?.[c] === true) : Object.keys(tableConfig.columns).filter((key) => !selectedColumns.includes(key));
			} else selectedColumns = Object.keys(tableConfig.columns);
			for (const field of selectedColumns) {
				const column = tableConfig.columns[field];
				fieldsSelection.push({
					tsKey: field,
					value: column
				});
			}
			let selectedRelations = [];
			if (config.with) selectedRelations = Object.entries(config.with).filter((entry) => !!entry[1]).map(([tsKey, queryConfig]) => ({
				tsKey,
				queryConfig,
				relation: tableConfig.relations[tsKey]
			}));
			let extras;
			if (config.extras) {
				extras = typeof config.extras === "function" ? config.extras(aliasedColumns, { sql }) : config.extras;
				for (const [tsKey, value] of Object.entries(extras)) fieldsSelection.push({
					tsKey,
					value: mapColumnsInAliasedSQLToAlias(value, tableAlias)
				});
			}
			for (const { tsKey, value } of fieldsSelection) selection.push({
				dbKey: is(value, SQL.Aliased) ? value.fieldAlias : tableConfig.columns[tsKey].name,
				tsKey,
				field: is(value, Column) ? aliasedTableColumn(value, tableAlias) : value,
				relationTableTsKey: void 0,
				isJson: false,
				selection: []
			});
			let orderByOrig = typeof config.orderBy === "function" ? config.orderBy(aliasedColumns, getOrderByOperators()) : config.orderBy ?? [];
			if (!Array.isArray(orderByOrig)) orderByOrig = [orderByOrig];
			orderBy = orderByOrig.map((orderByValue) => {
				if (is(orderByValue, Column)) return aliasedTableColumn(orderByValue, tableAlias);
				return mapColumnsInSQLToAlias(orderByValue, tableAlias);
			});
			limit = config.limit;
			offset = config.offset;
			for (const { tsKey: selectedRelationTsKey, queryConfig: selectedRelationConfigValue, relation } of selectedRelations) {
				const normalizedRelation = normalizeRelation(schema, tableNamesMap, relation);
				const relationTableTsName = tableNamesMap[getTableUniqueName(relation.referencedTable)];
				const relationTableAlias = `${tableAlias}_${selectedRelationTsKey}`;
				const joinOn2 = and(...normalizedRelation.fields.map((field2, i) => eq(aliasedTableColumn(normalizedRelation.references[i], relationTableAlias), aliasedTableColumn(field2, tableAlias))));
				const builtRelation = this.buildRelationalQuery({
					fullSchema,
					schema,
					tableNamesMap,
					table: fullSchema[relationTableTsName],
					tableConfig: schema[relationTableTsName],
					queryConfig: is(relation, One) ? selectedRelationConfigValue === true ? { limit: 1 } : {
						...selectedRelationConfigValue,
						limit: 1
					} : selectedRelationConfigValue,
					tableAlias: relationTableAlias,
					joinOn: joinOn2,
					nestedQueryRelation: relation
				});
				const field = sql`(${builtRelation.sql})`.as(selectedRelationTsKey);
				selection.push({
					dbKey: selectedRelationTsKey,
					tsKey: selectedRelationTsKey,
					field,
					relationTableTsKey: relationTableTsName,
					isJson: true,
					selection: builtRelation.selection
				});
			}
		}
		if (selection.length === 0) throw new DrizzleError({ message: `No fields selected for table "${tableConfig.tsName}" ("${tableAlias}"). You need to have at least one item in "columns", "with" or "extras". If you need to select all columns, omit the "columns" key or set it to undefined.` });
		let result;
		where = and(joinOn, where);
		if (nestedQueryRelation) {
			let field = sql`json_array(${sql.join(selection.map(({ field: field2 }) => is(field2, SQLiteColumn) ? sql.identifier(this.casing.getColumnCasing(field2)) : is(field2, SQL.Aliased) ? field2.sql : field2), sql`, `)})`;
			if (is(nestedQueryRelation, Many)) field = sql`coalesce(json_group_array(${field}), json_array())`;
			const nestedSelection = [{
				dbKey: "data",
				tsKey: "data",
				field: field.as("data"),
				isJson: true,
				relationTableTsKey: tableConfig.tsName,
				selection
			}];
			if (limit !== void 0 || offset !== void 0 || orderBy.length > 0) {
				result = this.buildSelectQuery({
					table: aliasedTable(table, tableAlias),
					fields: {},
					fieldsFlat: [{
						path: [],
						field: sql.raw("*")
					}],
					where,
					limit,
					offset,
					orderBy,
					setOperators: []
				});
				where = void 0;
				limit = void 0;
				offset = void 0;
				orderBy = void 0;
			} else result = aliasedTable(table, tableAlias);
			result = this.buildSelectQuery({
				table: is(result, SQLiteTable) ? result : new Subquery(result, {}, tableAlias),
				fields: {},
				fieldsFlat: nestedSelection.map(({ field: field2 }) => ({
					path: [],
					field: is(field2, Column) ? aliasedTableColumn(field2, tableAlias) : field2
				})),
				joins,
				where,
				limit,
				offset,
				orderBy,
				setOperators: []
			});
		} else result = this.buildSelectQuery({
			table: aliasedTable(table, tableAlias),
			fields: {},
			fieldsFlat: selection.map(({ field }) => ({
				path: [],
				field: is(field, Column) ? aliasedTableColumn(field, tableAlias) : field
			})),
			joins,
			where,
			limit,
			offset,
			orderBy,
			setOperators: []
		});
		return {
			tableTsKey: tableConfig.tsName,
			sql: result,
			selection
		};
	}
};
var SQLiteSyncDialect = class extends SQLiteDialect {
	static [entityKind] = "SQLiteSyncDialect";
	migrate(migrations, session, config) {
		const migrationsTable = config === void 0 ? "__drizzle_migrations" : typeof config === "string" ? "__drizzle_migrations" : config.migrationsTable ?? "__drizzle_migrations";
		const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at numeric
			)
		`;
		session.run(migrationTableCreate);
		const lastDbMigration = session.values(sql`SELECT id, hash, created_at FROM ${sql.identifier(migrationsTable)} ORDER BY created_at DESC LIMIT 1`)[0] ?? void 0;
		session.run(sql`BEGIN`);
		try {
			for (const migration of migrations) if (!lastDbMigration || Number(lastDbMigration[2]) < migration.folderMillis) {
				for (const stmt of migration.sql) session.run(sql.raw(stmt));
				session.run(sql`INSERT INTO ${sql.identifier(migrationsTable)} ("hash", "created_at") VALUES(${migration.hash}, ${migration.folderMillis})`);
			}
			session.run(sql`COMMIT`);
		} catch (e) {
			session.run(sql`ROLLBACK`);
			throw e;
		}
	}
};
var SQLiteAsyncDialect = class extends SQLiteDialect {
	static [entityKind] = "SQLiteAsyncDialect";
	async migrate(migrations, session, config) {
		const migrationsTable = config === void 0 ? "__drizzle_migrations" : typeof config === "string" ? "__drizzle_migrations" : config.migrationsTable ?? "__drizzle_migrations";
		const migrationTableCreate = sql`
			CREATE TABLE IF NOT EXISTS ${sql.identifier(migrationsTable)} (
				id SERIAL PRIMARY KEY,
				hash text NOT NULL,
				created_at numeric
			)
		`;
		await session.run(migrationTableCreate);
		const lastDbMigration = (await session.values(sql`SELECT id, hash, created_at FROM ${sql.identifier(migrationsTable)} ORDER BY created_at DESC LIMIT 1`))[0] ?? void 0;
		await session.transaction(async (tx) => {
			for (const migration of migrations) if (!lastDbMigration || Number(lastDbMigration[2]) < migration.folderMillis) {
				for (const stmt of migration.sql) await tx.run(sql.raw(stmt));
				await tx.run(sql`INSERT INTO ${sql.identifier(migrationsTable)} ("hash", "created_at") VALUES(${migration.hash}, ${migration.folderMillis})`);
			}
		});
	}
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/query-builders/query-builder.js
var TypedQueryBuilder = class {
	static [entityKind] = "TypedQueryBuilder";
	/** @internal */
	getSelectedFields() {
		return this._.selectedFields;
	}
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/sqlite-core/query-builders/select.js
var SQLiteSelectBuilder = class {
	static [entityKind] = "SQLiteSelectBuilder";
	fields;
	session;
	dialect;
	withList;
	distinct;
	constructor(config) {
		this.fields = config.fields;
		this.session = config.session;
		this.dialect = config.dialect;
		this.withList = config.withList;
		this.distinct = config.distinct;
	}
	from(source) {
		const isPartialSelect = !!this.fields;
		let fields;
		if (this.fields) fields = this.fields;
		else if (is(source, Subquery)) fields = Object.fromEntries(Object.keys(source._.selectedFields).map((key) => [key, source[key]]));
		else if (is(source, SQLiteViewBase)) fields = source[ViewBaseConfig].selectedFields;
		else if (is(source, SQL)) fields = {};
		else fields = getTableColumns(source);
		return new SQLiteSelectBase({
			table: source,
			fields,
			isPartialSelect,
			session: this.session,
			dialect: this.dialect,
			withList: this.withList,
			distinct: this.distinct
		});
	}
};
var SQLiteSelectQueryBuilderBase = class extends TypedQueryBuilder {
	static [entityKind] = "SQLiteSelectQueryBuilder";
	_;
	/** @internal */
	config;
	joinsNotNullableMap;
	tableName;
	isPartialSelect;
	session;
	dialect;
	cacheConfig = void 0;
	usedTables = /* @__PURE__ */ new Set();
	constructor({ table, fields, isPartialSelect, session, dialect, withList, distinct }) {
		super();
		this.config = {
			withList,
			table,
			fields: { ...fields },
			distinct,
			setOperators: []
		};
		this.isPartialSelect = isPartialSelect;
		this.session = session;
		this.dialect = dialect;
		this._ = {
			selectedFields: fields,
			config: this.config
		};
		this.tableName = getTableLikeName(table);
		this.joinsNotNullableMap = typeof this.tableName === "string" ? { [this.tableName]: true } : {};
		for (const item of extractUsedTable(table)) this.usedTables.add(item);
	}
	/** @internal */
	getUsedTables() {
		return [...this.usedTables];
	}
	createJoin(joinType) {
		return (table, on) => {
			const baseTableName = this.tableName;
			const tableName = getTableLikeName(table);
			for (const item of extractUsedTable(table)) this.usedTables.add(item);
			if (typeof tableName === "string" && this.config.joins?.some((join) => join.alias === tableName)) throw new Error(`Alias "${tableName}" is already used in this query`);
			if (!this.isPartialSelect) {
				if (Object.keys(this.joinsNotNullableMap).length === 1 && typeof baseTableName === "string") this.config.fields = { [baseTableName]: this.config.fields };
				if (typeof tableName === "string" && !is(table, SQL)) {
					const selection = is(table, Subquery) ? table._.selectedFields : is(table, View) ? table[ViewBaseConfig].selectedFields : table[Table.Symbol.Columns];
					this.config.fields[tableName] = selection;
				}
			}
			if (typeof on === "function") on = on(new Proxy(this.config.fields, new SelectionProxyHandler({
				sqlAliasedBehavior: "sql",
				sqlBehavior: "sql"
			})));
			if (!this.config.joins) this.config.joins = [];
			this.config.joins.push({
				on,
				table,
				joinType,
				alias: tableName
			});
			if (typeof tableName === "string") switch (joinType) {
				case "left":
					this.joinsNotNullableMap[tableName] = false;
					break;
				case "right":
					this.joinsNotNullableMap = Object.fromEntries(Object.entries(this.joinsNotNullableMap).map(([key]) => [key, false]));
					this.joinsNotNullableMap[tableName] = true;
					break;
				case "cross":
				case "inner":
					this.joinsNotNullableMap[tableName] = true;
					break;
				case "full":
					this.joinsNotNullableMap = Object.fromEntries(Object.entries(this.joinsNotNullableMap).map(([key]) => [key, false]));
					this.joinsNotNullableMap[tableName] = false;
					break;
			}
			return this;
		};
	}
	/**
	* Executes a `left join` operation by adding another table to the current query.
	*
	* Calling this method associates each row of the table with the corresponding row from the joined table, if a match is found. If no matching row exists, it sets all columns of the joined table to null.
	*
	* See docs: {@link https://orm.drizzle.team/docs/joins#left-join}
	*
	* @param table the table to join.
	* @param on the `on` clause.
	*
	* @example
	*
	* ```ts
	* // Select all users and their pets
	* const usersWithPets: { user: User; pets: Pet | null; }[] = await db.select()
	*   .from(users)
	*   .leftJoin(pets, eq(users.id, pets.ownerId))
	*
	* // Select userId and petId
	* const usersIdsAndPetIds: { userId: number; petId: number | null; }[] = await db.select({
	*   userId: users.id,
	*   petId: pets.id,
	* })
	*   .from(users)
	*   .leftJoin(pets, eq(users.id, pets.ownerId))
	* ```
	*/
	leftJoin = this.createJoin("left");
	/**
	* Executes a `right join` operation by adding another table to the current query.
	*
	* Calling this method associates each row of the joined table with the corresponding row from the main table, if a match is found. If no matching row exists, it sets all columns of the main table to null.
	*
	* See docs: {@link https://orm.drizzle.team/docs/joins#right-join}
	*
	* @param table the table to join.
	* @param on the `on` clause.
	*
	* @example
	*
	* ```ts
	* // Select all users and their pets
	* const usersWithPets: { user: User | null; pets: Pet; }[] = await db.select()
	*   .from(users)
	*   .rightJoin(pets, eq(users.id, pets.ownerId))
	*
	* // Select userId and petId
	* const usersIdsAndPetIds: { userId: number | null; petId: number; }[] = await db.select({
	*   userId: users.id,
	*   petId: pets.id,
	* })
	*   .from(users)
	*   .rightJoin(pets, eq(users.id, pets.ownerId))
	* ```
	*/
	rightJoin = this.createJoin("right");
	/**
	* Executes an `inner join` operation, creating a new table by combining rows from two tables that have matching values.
	*
	* Calling this method retrieves rows that have corresponding entries in both joined tables. Rows without matching entries in either table are excluded, resulting in a table that includes only matching pairs.
	*
	* See docs: {@link https://orm.drizzle.team/docs/joins#inner-join}
	*
	* @param table the table to join.
	* @param on the `on` clause.
	*
	* @example
	*
	* ```ts
	* // Select all users and their pets
	* const usersWithPets: { user: User; pets: Pet; }[] = await db.select()
	*   .from(users)
	*   .innerJoin(pets, eq(users.id, pets.ownerId))
	*
	* // Select userId and petId
	* const usersIdsAndPetIds: { userId: number; petId: number; }[] = await db.select({
	*   userId: users.id,
	*   petId: pets.id,
	* })
	*   .from(users)
	*   .innerJoin(pets, eq(users.id, pets.ownerId))
	* ```
	*/
	innerJoin = this.createJoin("inner");
	/**
	* Executes a `full join` operation by combining rows from two tables into a new table.
	*
	* Calling this method retrieves all rows from both main and joined tables, merging rows with matching values and filling in `null` for non-matching columns.
	*
	* See docs: {@link https://orm.drizzle.team/docs/joins#full-join}
	*
	* @param table the table to join.
	* @param on the `on` clause.
	*
	* @example
	*
	* ```ts
	* // Select all users and their pets
	* const usersWithPets: { user: User | null; pets: Pet | null; }[] = await db.select()
	*   .from(users)
	*   .fullJoin(pets, eq(users.id, pets.ownerId))
	*
	* // Select userId and petId
	* const usersIdsAndPetIds: { userId: number | null; petId: number | null; }[] = await db.select({
	*   userId: users.id,
	*   petId: pets.id,
	* })
	*   .from(users)
	*   .fullJoin(pets, eq(users.id, pets.ownerId))
	* ```
	*/
	fullJoin = this.createJoin("full");
	/**
	* Executes a `cross join` operation by combining rows from two tables into a new table.
	*
	* Calling this method retrieves all rows from both main and joined tables, merging all rows from each table.
	*
	* See docs: {@link https://orm.drizzle.team/docs/joins#cross-join}
	*
	* @param table the table to join.
	*
	* @example
	*
	* ```ts
	* // Select all users, each user with every pet
	* const usersWithPets: { user: User; pets: Pet; }[] = await db.select()
	*   .from(users)
	*   .crossJoin(pets)
	*
	* // Select userId and petId
	* const usersIdsAndPetIds: { userId: number; petId: number; }[] = await db.select({
	*   userId: users.id,
	*   petId: pets.id,
	* })
	*   .from(users)
	*   .crossJoin(pets)
	* ```
	*/
	crossJoin = this.createJoin("cross");
	createSetOperator(type, isAll) {
		return (rightSelection) => {
			const rightSelect = typeof rightSelection === "function" ? rightSelection(getSQLiteSetOperators()) : rightSelection;
			if (!haveSameKeys(this.getSelectedFields(), rightSelect.getSelectedFields())) throw new Error("Set operator error (union / intersect / except): selected fields are not the same or are in a different order");
			this.config.setOperators.push({
				type,
				isAll,
				rightSelect
			});
			return this;
		};
	}
	/**
	* Adds `union` set operator to the query.
	*
	* Calling this method will combine the result sets of the `select` statements and remove any duplicate rows that appear across them.
	*
	* See docs: {@link https://orm.drizzle.team/docs/set-operations#union}
	*
	* @example
	*
	* ```ts
	* // Select all unique names from customers and users tables
	* await db.select({ name: users.name })
	*   .from(users)
	*   .union(
	*     db.select({ name: customers.name }).from(customers)
	*   );
	* // or
	* import { union } from 'drizzle-orm/sqlite-core'
	*
	* await union(
	*   db.select({ name: users.name }).from(users),
	*   db.select({ name: customers.name }).from(customers)
	* );
	* ```
	*/
	union = this.createSetOperator("union", false);
	/**
	* Adds `union all` set operator to the query.
	*
	* Calling this method will combine the result-set of the `select` statements and keep all duplicate rows that appear across them.
	*
	* See docs: {@link https://orm.drizzle.team/docs/set-operations#union-all}
	*
	* @example
	*
	* ```ts
	* // Select all transaction ids from both online and in-store sales
	* await db.select({ transaction: onlineSales.transactionId })
	*   .from(onlineSales)
	*   .unionAll(
	*     db.select({ transaction: inStoreSales.transactionId }).from(inStoreSales)
	*   );
	* // or
	* import { unionAll } from 'drizzle-orm/sqlite-core'
	*
	* await unionAll(
	*   db.select({ transaction: onlineSales.transactionId }).from(onlineSales),
	*   db.select({ transaction: inStoreSales.transactionId }).from(inStoreSales)
	* );
	* ```
	*/
	unionAll = this.createSetOperator("union", true);
	/**
	* Adds `intersect` set operator to the query.
	*
	* Calling this method will retain only the rows that are present in both result sets and eliminate duplicates.
	*
	* See docs: {@link https://orm.drizzle.team/docs/set-operations#intersect}
	*
	* @example
	*
	* ```ts
	* // Select course names that are offered in both departments A and B
	* await db.select({ courseName: depA.courseName })
	*   .from(depA)
	*   .intersect(
	*     db.select({ courseName: depB.courseName }).from(depB)
	*   );
	* // or
	* import { intersect } from 'drizzle-orm/sqlite-core'
	*
	* await intersect(
	*   db.select({ courseName: depA.courseName }).from(depA),
	*   db.select({ courseName: depB.courseName }).from(depB)
	* );
	* ```
	*/
	intersect = this.createSetOperator("intersect", false);
	/**
	* Adds `except` set operator to the query.
	*
	* Calling this method will retrieve all unique rows from the left query, except for the rows that are present in the result set of the right query.
	*
	* See docs: {@link https://orm.drizzle.team/docs/set-operations#except}
	*
	* @example
	*
	* ```ts
	* // Select all courses offered in department A but not in department B
	* await db.select({ courseName: depA.courseName })
	*   .from(depA)
	*   .except(
	*     db.select({ courseName: depB.courseName }).from(depB)
	*   );
	* // or
	* import { except } from 'drizzle-orm/sqlite-core'
	*
	* await except(
	*   db.select({ courseName: depA.courseName }).from(depA),
	*   db.select({ courseName: depB.courseName }).from(depB)
	* );
	* ```
	*/
	except = this.createSetOperator("except", false);
	/** @internal */
	addSetOperators(setOperators) {
		this.config.setOperators.push(...setOperators);
		return this;
	}
	/**
	* Adds a `where` clause to the query.
	*
	* Calling this method will select only those rows that fulfill a specified condition.
	*
	* See docs: {@link https://orm.drizzle.team/docs/select#filtering}
	*
	* @param where the `where` clause.
	*
	* @example
	* You can use conditional operators and `sql function` to filter the rows to be selected.
	*
	* ```ts
	* // Select all cars with green color
	* await db.select().from(cars).where(eq(cars.color, 'green'));
	* // or
	* await db.select().from(cars).where(sql`${cars.color} = 'green'`)
	* ```
	*
	* You can logically combine conditional operators with `and()` and `or()` operators:
	*
	* ```ts
	* // Select all BMW cars with a green color
	* await db.select().from(cars).where(and(eq(cars.color, 'green'), eq(cars.brand, 'BMW')));
	*
	* // Select all cars with the green or blue color
	* await db.select().from(cars).where(or(eq(cars.color, 'green'), eq(cars.color, 'blue')));
	* ```
	*/
	where(where) {
		if (typeof where === "function") where = where(new Proxy(this.config.fields, new SelectionProxyHandler({
			sqlAliasedBehavior: "sql",
			sqlBehavior: "sql"
		})));
		this.config.where = where;
		return this;
	}
	/**
	* Adds a `having` clause to the query.
	*
	* Calling this method will select only those rows that fulfill a specified condition. It is typically used with aggregate functions to filter the aggregated data based on a specified condition.
	*
	* See docs: {@link https://orm.drizzle.team/docs/select#aggregations}
	*
	* @param having the `having` clause.
	*
	* @example
	*
	* ```ts
	* // Select all brands with more than one car
	* await db.select({
	* 	brand: cars.brand,
	* 	count: sql<number>`cast(count(${cars.id}) as int)`,
	* })
	*   .from(cars)
	*   .groupBy(cars.brand)
	*   .having(({ count }) => gt(count, 1));
	* ```
	*/
	having(having) {
		if (typeof having === "function") having = having(new Proxy(this.config.fields, new SelectionProxyHandler({
			sqlAliasedBehavior: "sql",
			sqlBehavior: "sql"
		})));
		this.config.having = having;
		return this;
	}
	groupBy(...columns) {
		if (typeof columns[0] === "function") {
			const groupBy = columns[0](new Proxy(this.config.fields, new SelectionProxyHandler({
				sqlAliasedBehavior: "alias",
				sqlBehavior: "sql"
			})));
			this.config.groupBy = Array.isArray(groupBy) ? groupBy : [groupBy];
		} else this.config.groupBy = columns;
		return this;
	}
	orderBy(...columns) {
		if (typeof columns[0] === "function") {
			const orderBy = columns[0](new Proxy(this.config.fields, new SelectionProxyHandler({
				sqlAliasedBehavior: "alias",
				sqlBehavior: "sql"
			})));
			const orderByArray = Array.isArray(orderBy) ? orderBy : [orderBy];
			if (this.config.setOperators.length > 0) this.config.setOperators.at(-1).orderBy = orderByArray;
			else this.config.orderBy = orderByArray;
		} else {
			const orderByArray = columns;
			if (this.config.setOperators.length > 0) this.config.setOperators.at(-1).orderBy = orderByArray;
			else this.config.orderBy = orderByArray;
		}
		return this;
	}
	/**
	* Adds a `limit` clause to the query.
	*
	* Calling this method will set the maximum number of rows that will be returned by this query.
	*
	* See docs: {@link https://orm.drizzle.team/docs/select#limit--offset}
	*
	* @param limit the `limit` clause.
	*
	* @example
	*
	* ```ts
	* // Get the first 10 people from this query.
	* await db.select().from(people).limit(10);
	* ```
	*/
	limit(limit) {
		if (this.config.setOperators.length > 0) this.config.setOperators.at(-1).limit = limit;
		else this.config.limit = limit;
		return this;
	}
	/**
	* Adds an `offset` clause to the query.
	*
	* Calling this method will skip a number of rows when returning results from this query.
	*
	* See docs: {@link https://orm.drizzle.team/docs/select#limit--offset}
	*
	* @param offset the `offset` clause.
	*
	* @example
	*
	* ```ts
	* // Get the 10th-20th people from this query.
	* await db.select().from(people).offset(10).limit(10);
	* ```
	*/
	offset(offset) {
		if (this.config.setOperators.length > 0) this.config.setOperators.at(-1).offset = offset;
		else this.config.offset = offset;
		return this;
	}
	/** @internal */
	getSQL() {
		return this.dialect.buildSelectQuery(this.config);
	}
	toSQL() {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}
	as(alias) {
		const usedTables = [];
		usedTables.push(...extractUsedTable(this.config.table));
		if (this.config.joins) for (const it of this.config.joins) usedTables.push(...extractUsedTable(it.table));
		return new Proxy(new Subquery(this.getSQL(), this.config.fields, alias, false, [...new Set(usedTables)]), new SelectionProxyHandler({
			alias,
			sqlAliasedBehavior: "alias",
			sqlBehavior: "error"
		}));
	}
	/** @internal */
	getSelectedFields() {
		return new Proxy(this.config.fields, new SelectionProxyHandler({
			alias: this.tableName,
			sqlAliasedBehavior: "alias",
			sqlBehavior: "error"
		}));
	}
	$dynamic() {
		return this;
	}
};
var SQLiteSelectBase = class extends SQLiteSelectQueryBuilderBase {
	static [entityKind] = "SQLiteSelect";
	/** @internal */
	_prepare(isOneTimeQuery = true) {
		if (!this.session) throw new Error("Cannot execute a query on a query builder. Please use a database instance instead.");
		const fieldsList = orderSelectedFields(this.config.fields);
		const query = this.session[isOneTimeQuery ? "prepareOneTimeQuery" : "prepareQuery"](this.dialect.sqlToQuery(this.getSQL()), fieldsList, "all", true, void 0, {
			type: "select",
			tables: [...this.usedTables]
		}, this.cacheConfig);
		query.joinsNotNullableMap = this.joinsNotNullableMap;
		return query;
	}
	$withCache(config) {
		this.cacheConfig = config === void 0 ? {
			config: {},
			enable: true,
			autoInvalidate: true
		} : config === false ? { enable: false } : {
			enable: true,
			autoInvalidate: true,
			...config
		};
		return this;
	}
	prepare() {
		return this._prepare(false);
	}
	run = (placeholderValues) => {
		return this._prepare().run(placeholderValues);
	};
	all = (placeholderValues) => {
		return this._prepare().all(placeholderValues);
	};
	get = (placeholderValues) => {
		return this._prepare().get(placeholderValues);
	};
	values = (placeholderValues) => {
		return this._prepare().values(placeholderValues);
	};
	async execute() {
		return this.all();
	}
};
applyMixins(SQLiteSelectBase, [QueryPromise]);
function createSetOperator(type, isAll) {
	return (leftSelect, rightSelect, ...restSelects) => {
		const setOperators = [rightSelect, ...restSelects].map((select) => ({
			type,
			isAll,
			rightSelect: select
		}));
		for (const setOperator of setOperators) if (!haveSameKeys(leftSelect.getSelectedFields(), setOperator.rightSelect.getSelectedFields())) throw new Error("Set operator error (union / intersect / except): selected fields are not the same or are in a different order");
		return leftSelect.addSetOperators(setOperators);
	};
}
const getSQLiteSetOperators = () => ({
	union,
	unionAll,
	intersect,
	except
});
const union = createSetOperator("union", false);
const unionAll = createSetOperator("union", true);
const intersect = createSetOperator("intersect", false);
const except = createSetOperator("except", false);

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/sqlite-core/query-builders/query-builder.js
var QueryBuilder = class {
	static [entityKind] = "SQLiteQueryBuilder";
	dialect;
	dialectConfig;
	constructor(dialect) {
		this.dialect = is(dialect, SQLiteDialect) ? dialect : void 0;
		this.dialectConfig = is(dialect, SQLiteDialect) ? void 0 : dialect;
	}
	$with = (alias, selection) => {
		const queryBuilder = this;
		const as = (qb) => {
			if (typeof qb === "function") qb = qb(queryBuilder);
			return new Proxy(new WithSubquery(qb.getSQL(), selection ?? ("getSelectedFields" in qb ? qb.getSelectedFields() ?? {} : {}), alias, true), new SelectionProxyHandler({
				alias,
				sqlAliasedBehavior: "alias",
				sqlBehavior: "error"
			}));
		};
		return { as };
	};
	with(...queries) {
		const self = this;
		function select(fields) {
			return new SQLiteSelectBuilder({
				fields: fields ?? void 0,
				session: void 0,
				dialect: self.getDialect(),
				withList: queries
			});
		}
		function selectDistinct(fields) {
			return new SQLiteSelectBuilder({
				fields: fields ?? void 0,
				session: void 0,
				dialect: self.getDialect(),
				withList: queries,
				distinct: true
			});
		}
		return {
			select,
			selectDistinct
		};
	}
	select(fields) {
		return new SQLiteSelectBuilder({
			fields: fields ?? void 0,
			session: void 0,
			dialect: this.getDialect()
		});
	}
	selectDistinct(fields) {
		return new SQLiteSelectBuilder({
			fields: fields ?? void 0,
			session: void 0,
			dialect: this.getDialect(),
			distinct: true
		});
	}
	getDialect() {
		if (!this.dialect) this.dialect = new SQLiteSyncDialect(this.dialectConfig);
		return this.dialect;
	}
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/sqlite-core/query-builders/insert.js
var SQLiteInsertBuilder = class {
	constructor(table, session, dialect, withList) {
		this.table = table;
		this.session = session;
		this.dialect = dialect;
		this.withList = withList;
	}
	static [entityKind] = "SQLiteInsertBuilder";
	values(values) {
		values = Array.isArray(values) ? values : [values];
		if (values.length === 0) throw new Error("values() must be called with at least one value");
		const mappedValues = values.map((entry) => {
			const result = {};
			const cols = this.table[Table.Symbol.Columns];
			for (const colKey of Object.keys(entry)) {
				const colValue = entry[colKey];
				result[colKey] = is(colValue, SQL) ? colValue : new Param(colValue, cols[colKey]);
			}
			return result;
		});
		return new SQLiteInsertBase(this.table, mappedValues, this.session, this.dialect, this.withList);
	}
	select(selectQuery) {
		const select = typeof selectQuery === "function" ? selectQuery(new QueryBuilder()) : selectQuery;
		if (!is(select, SQL) && !haveSameKeys(this.table[Columns], select._.selectedFields)) throw new Error("Insert select error: selected fields are not the same or are in a different order compared to the table definition");
		return new SQLiteInsertBase(this.table, select, this.session, this.dialect, this.withList, true);
	}
};
var SQLiteInsertBase = class extends QueryPromise {
	constructor(table, values, session, dialect, withList, select) {
		super();
		this.session = session;
		this.dialect = dialect;
		this.config = {
			table,
			values,
			withList,
			select
		};
	}
	static [entityKind] = "SQLiteInsert";
	/** @internal */
	config;
	returning(fields = this.config.table[SQLiteTable.Symbol.Columns]) {
		this.config.returning = orderSelectedFields(fields);
		return this;
	}
	/**
	* Adds an `on conflict do nothing` clause to the query.
	*
	* Calling this method simply avoids inserting a row as its alternative action.
	*
	* See docs: {@link https://orm.drizzle.team/docs/insert#on-conflict-do-nothing}
	*
	* @param config The `target` and `where` clauses.
	*
	* @example
	* ```ts
	* // Insert one row and cancel the insert if there's a conflict
	* await db.insert(cars)
	*   .values({ id: 1, brand: 'BMW' })
	*   .onConflictDoNothing();
	*
	* // Explicitly specify conflict target
	* await db.insert(cars)
	*   .values({ id: 1, brand: 'BMW' })
	*   .onConflictDoNothing({ target: cars.id });
	* ```
	*/
	onConflictDoNothing(config = {}) {
		if (!this.config.onConflict) this.config.onConflict = [];
		if (config.target === void 0) this.config.onConflict.push(sql` on conflict do nothing`);
		else {
			const targetSql = Array.isArray(config.target) ? sql`${config.target}` : sql`${[config.target]}`;
			const whereSql = config.where ? sql` where ${config.where}` : sql``;
			this.config.onConflict.push(sql` on conflict ${targetSql} do nothing${whereSql}`);
		}
		return this;
	}
	/**
	* Adds an `on conflict do update` clause to the query.
	*
	* Calling this method will update the existing row that conflicts with the row proposed for insertion as its alternative action.
	*
	* See docs: {@link https://orm.drizzle.team/docs/insert#upserts-and-conflicts}
	*
	* @param config The `target`, `set` and `where` clauses.
	*
	* @example
	* ```ts
	* // Update the row if there's a conflict
	* await db.insert(cars)
	*   .values({ id: 1, brand: 'BMW' })
	*   .onConflictDoUpdate({
	*     target: cars.id,
	*     set: { brand: 'Porsche' }
	*   });
	*
	* // Upsert with 'where' clause
	* await db.insert(cars)
	*   .values({ id: 1, brand: 'BMW' })
	*   .onConflictDoUpdate({
	*     target: cars.id,
	*     set: { brand: 'newBMW' },
	*     where: sql`${cars.createdAt} > '2023-01-01'::date`,
	*   });
	* ```
	*/
	onConflictDoUpdate(config) {
		if (config.where && (config.targetWhere || config.setWhere)) throw new Error("You cannot use both \"where\" and \"targetWhere\"/\"setWhere\" at the same time - \"where\" is deprecated, use \"targetWhere\" or \"setWhere\" instead.");
		if (!this.config.onConflict) this.config.onConflict = [];
		const whereSql = config.where ? sql` where ${config.where}` : void 0;
		const targetWhereSql = config.targetWhere ? sql` where ${config.targetWhere}` : void 0;
		const setWhereSql = config.setWhere ? sql` where ${config.setWhere}` : void 0;
		const targetSql = Array.isArray(config.target) ? sql`${config.target}` : sql`${[config.target]}`;
		const setSql = this.dialect.buildUpdateSet(this.config.table, mapUpdateSet(this.config.table, config.set));
		this.config.onConflict.push(sql` on conflict ${targetSql}${targetWhereSql} do update set ${setSql}${whereSql}${setWhereSql}`);
		return this;
	}
	/** @internal */
	getSQL() {
		return this.dialect.buildInsertQuery(this.config);
	}
	toSQL() {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}
	/** @internal */
	_prepare(isOneTimeQuery = true) {
		return this.session[isOneTimeQuery ? "prepareOneTimeQuery" : "prepareQuery"](this.dialect.sqlToQuery(this.getSQL()), this.config.returning, this.config.returning ? "all" : "run", true, void 0, {
			type: "insert",
			tables: extractUsedTable(this.config.table)
		});
	}
	prepare() {
		return this._prepare(false);
	}
	run = (placeholderValues) => {
		return this._prepare().run(placeholderValues);
	};
	all = (placeholderValues) => {
		return this._prepare().all(placeholderValues);
	};
	get = (placeholderValues) => {
		return this._prepare().get(placeholderValues);
	};
	values = (placeholderValues) => {
		return this._prepare().values(placeholderValues);
	};
	async execute() {
		return this.config.returning ? this.all() : this.run();
	}
	$dynamic() {
		return this;
	}
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/sqlite-core/query-builders/update.js
var SQLiteUpdateBuilder = class {
	constructor(table, session, dialect, withList) {
		this.table = table;
		this.session = session;
		this.dialect = dialect;
		this.withList = withList;
	}
	static [entityKind] = "SQLiteUpdateBuilder";
	set(values) {
		return new SQLiteUpdateBase(this.table, mapUpdateSet(this.table, values), this.session, this.dialect, this.withList);
	}
};
var SQLiteUpdateBase = class extends QueryPromise {
	constructor(table, set, session, dialect, withList) {
		super();
		this.session = session;
		this.dialect = dialect;
		this.config = {
			set,
			table,
			withList,
			joins: []
		};
	}
	static [entityKind] = "SQLiteUpdate";
	/** @internal */
	config;
	from(source) {
		this.config.from = source;
		return this;
	}
	createJoin(joinType) {
		return (table, on) => {
			const tableName = getTableLikeName(table);
			if (typeof tableName === "string" && this.config.joins.some((join) => join.alias === tableName)) throw new Error(`Alias "${tableName}" is already used in this query`);
			if (typeof on === "function") {
				const from = this.config.from ? is(table, SQLiteTable) ? table[Table.Symbol.Columns] : is(table, Subquery) ? table._.selectedFields : is(table, SQLiteViewBase) ? table[ViewBaseConfig].selectedFields : void 0 : void 0;
				on = on(new Proxy(this.config.table[Table.Symbol.Columns], new SelectionProxyHandler({
					sqlAliasedBehavior: "sql",
					sqlBehavior: "sql"
				})), from && new Proxy(from, new SelectionProxyHandler({
					sqlAliasedBehavior: "sql",
					sqlBehavior: "sql"
				})));
			}
			this.config.joins.push({
				on,
				table,
				joinType,
				alias: tableName
			});
			return this;
		};
	}
	leftJoin = this.createJoin("left");
	rightJoin = this.createJoin("right");
	innerJoin = this.createJoin("inner");
	fullJoin = this.createJoin("full");
	/**
	* Adds a 'where' clause to the query.
	*
	* Calling this method will update only those rows that fulfill a specified condition.
	*
	* See docs: {@link https://orm.drizzle.team/docs/update}
	*
	* @param where the 'where' clause.
	*
	* @example
	* You can use conditional operators and `sql function` to filter the rows to be updated.
	*
	* ```ts
	* // Update all cars with green color
	* db.update(cars).set({ color: 'red' })
	*   .where(eq(cars.color, 'green'));
	* // or
	* db.update(cars).set({ color: 'red' })
	*   .where(sql`${cars.color} = 'green'`)
	* ```
	*
	* You can logically combine conditional operators with `and()` and `or()` operators:
	*
	* ```ts
	* // Update all BMW cars with a green color
	* db.update(cars).set({ color: 'red' })
	*   .where(and(eq(cars.color, 'green'), eq(cars.brand, 'BMW')));
	*
	* // Update all cars with the green or blue color
	* db.update(cars).set({ color: 'red' })
	*   .where(or(eq(cars.color, 'green'), eq(cars.color, 'blue')));
	* ```
	*/
	where(where) {
		this.config.where = where;
		return this;
	}
	orderBy(...columns) {
		if (typeof columns[0] === "function") {
			const orderBy = columns[0](new Proxy(this.config.table[Table.Symbol.Columns], new SelectionProxyHandler({
				sqlAliasedBehavior: "alias",
				sqlBehavior: "sql"
			})));
			const orderByArray = Array.isArray(orderBy) ? orderBy : [orderBy];
			this.config.orderBy = orderByArray;
		} else {
			const orderByArray = columns;
			this.config.orderBy = orderByArray;
		}
		return this;
	}
	limit(limit) {
		this.config.limit = limit;
		return this;
	}
	returning(fields = this.config.table[SQLiteTable.Symbol.Columns]) {
		this.config.returning = orderSelectedFields(fields);
		return this;
	}
	/** @internal */
	getSQL() {
		return this.dialect.buildUpdateQuery(this.config);
	}
	toSQL() {
		const { typings: _typings, ...rest } = this.dialect.sqlToQuery(this.getSQL());
		return rest;
	}
	/** @internal */
	_prepare(isOneTimeQuery = true) {
		return this.session[isOneTimeQuery ? "prepareOneTimeQuery" : "prepareQuery"](this.dialect.sqlToQuery(this.getSQL()), this.config.returning, this.config.returning ? "all" : "run", true, void 0, {
			type: "insert",
			tables: extractUsedTable(this.config.table)
		});
	}
	prepare() {
		return this._prepare(false);
	}
	run = (placeholderValues) => {
		return this._prepare().run(placeholderValues);
	};
	all = (placeholderValues) => {
		return this._prepare().all(placeholderValues);
	};
	get = (placeholderValues) => {
		return this._prepare().get(placeholderValues);
	};
	values = (placeholderValues) => {
		return this._prepare().values(placeholderValues);
	};
	async execute() {
		return this.config.returning ? this.all() : this.run();
	}
	$dynamic() {
		return this;
	}
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/sqlite-core/query-builders/count.js
var SQLiteCountBuilder = class SQLiteCountBuilder extends SQL {
	constructor(params) {
		super(SQLiteCountBuilder.buildEmbeddedCount(params.source, params.filters).queryChunks);
		this.params = params;
		this.session = params.session;
		this.sql = SQLiteCountBuilder.buildCount(params.source, params.filters);
	}
	sql;
	static [entityKind] = "SQLiteCountBuilderAsync";
	[Symbol.toStringTag] = "SQLiteCountBuilderAsync";
	session;
	static buildEmbeddedCount(source, filters) {
		return sql`(select count(*) from ${source}${sql.raw(" where ").if(filters)}${filters})`;
	}
	static buildCount(source, filters) {
		return sql`select count(*) from ${source}${sql.raw(" where ").if(filters)}${filters}`;
	}
	then(onfulfilled, onrejected) {
		return Promise.resolve(this.session.count(this.sql)).then(onfulfilled, onrejected);
	}
	catch(onRejected) {
		return this.then(void 0, onRejected);
	}
	finally(onFinally) {
		return this.then((value) => {
			onFinally?.();
			return value;
		}, (reason) => {
			onFinally?.();
			throw reason;
		});
	}
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/sqlite-core/query-builders/query.js
var RelationalQueryBuilder = class {
	constructor(mode, fullSchema, schema, tableNamesMap, table, tableConfig, dialect, session) {
		this.mode = mode;
		this.fullSchema = fullSchema;
		this.schema = schema;
		this.tableNamesMap = tableNamesMap;
		this.table = table;
		this.tableConfig = tableConfig;
		this.dialect = dialect;
		this.session = session;
	}
	static [entityKind] = "SQLiteAsyncRelationalQueryBuilder";
	findMany(config) {
		return this.mode === "sync" ? new SQLiteSyncRelationalQuery(this.fullSchema, this.schema, this.tableNamesMap, this.table, this.tableConfig, this.dialect, this.session, config ? config : {}, "many") : new SQLiteRelationalQuery(this.fullSchema, this.schema, this.tableNamesMap, this.table, this.tableConfig, this.dialect, this.session, config ? config : {}, "many");
	}
	findFirst(config) {
		return this.mode === "sync" ? new SQLiteSyncRelationalQuery(this.fullSchema, this.schema, this.tableNamesMap, this.table, this.tableConfig, this.dialect, this.session, config ? {
			...config,
			limit: 1
		} : { limit: 1 }, "first") : new SQLiteRelationalQuery(this.fullSchema, this.schema, this.tableNamesMap, this.table, this.tableConfig, this.dialect, this.session, config ? {
			...config,
			limit: 1
		} : { limit: 1 }, "first");
	}
};
var SQLiteRelationalQuery = class extends QueryPromise {
	constructor(fullSchema, schema, tableNamesMap, table, tableConfig, dialect, session, config, mode) {
		super();
		this.fullSchema = fullSchema;
		this.schema = schema;
		this.tableNamesMap = tableNamesMap;
		this.table = table;
		this.tableConfig = tableConfig;
		this.dialect = dialect;
		this.session = session;
		this.config = config;
		this.mode = mode;
	}
	static [entityKind] = "SQLiteAsyncRelationalQuery";
	/** @internal */
	mode;
	/** @internal */
	getSQL() {
		return this.dialect.buildRelationalQuery({
			fullSchema: this.fullSchema,
			schema: this.schema,
			tableNamesMap: this.tableNamesMap,
			table: this.table,
			tableConfig: this.tableConfig,
			queryConfig: this.config,
			tableAlias: this.tableConfig.tsName
		}).sql;
	}
	/** @internal */
	_prepare(isOneTimeQuery = false) {
		const { query, builtQuery } = this._toSQL();
		return this.session[isOneTimeQuery ? "prepareOneTimeQuery" : "prepareQuery"](builtQuery, void 0, this.mode === "first" ? "get" : "all", true, (rawRows, mapColumnValue) => {
			const rows = rawRows.map((row) => mapRelationalRow(this.schema, this.tableConfig, row, query.selection, mapColumnValue));
			if (this.mode === "first") return rows[0];
			return rows;
		});
	}
	prepare() {
		return this._prepare(false);
	}
	_toSQL() {
		const query = this.dialect.buildRelationalQuery({
			fullSchema: this.fullSchema,
			schema: this.schema,
			tableNamesMap: this.tableNamesMap,
			table: this.table,
			tableConfig: this.tableConfig,
			queryConfig: this.config,
			tableAlias: this.tableConfig.tsName
		});
		return {
			query,
			builtQuery: this.dialect.sqlToQuery(query.sql)
		};
	}
	toSQL() {
		return this._toSQL().builtQuery;
	}
	/** @internal */
	executeRaw() {
		if (this.mode === "first") return this._prepare(false).get();
		return this._prepare(false).all();
	}
	async execute() {
		return this.executeRaw();
	}
};
var SQLiteSyncRelationalQuery = class extends SQLiteRelationalQuery {
	static [entityKind] = "SQLiteSyncRelationalQuery";
	sync() {
		return this.executeRaw();
	}
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/sqlite-core/query-builders/raw.js
var SQLiteRaw = class extends QueryPromise {
	constructor(execute, getSQL, action, dialect, mapBatchResult) {
		super();
		this.execute = execute;
		this.getSQL = getSQL;
		this.dialect = dialect;
		this.mapBatchResult = mapBatchResult;
		this.config = { action };
	}
	static [entityKind] = "SQLiteRaw";
	/** @internal */
	config;
	getQuery() {
		return {
			...this.dialect.sqlToQuery(this.getSQL()),
			method: this.config.action
		};
	}
	mapResult(result, isFromBatch) {
		return isFromBatch ? this.mapBatchResult(result) : result;
	}
	_prepare() {
		return this;
	}
	/** @internal */
	isResponseInArrayMode() {
		return false;
	}
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/sqlite-core/db.js
var BaseSQLiteDatabase = class {
	constructor(resultKind, dialect, session, schema) {
		this.resultKind = resultKind;
		this.dialect = dialect;
		this.session = session;
		this._ = schema ? {
			schema: schema.schema,
			fullSchema: schema.fullSchema,
			tableNamesMap: schema.tableNamesMap
		} : {
			schema: void 0,
			fullSchema: {},
			tableNamesMap: {}
		};
		this.query = {};
		const query = this.query;
		if (this._.schema) for (const [tableName, columns] of Object.entries(this._.schema)) query[tableName] = new RelationalQueryBuilder(resultKind, schema.fullSchema, this._.schema, this._.tableNamesMap, schema.fullSchema[tableName], columns, dialect, session);
		this.$cache = { invalidate: async (_params) => {} };
	}
	static [entityKind] = "BaseSQLiteDatabase";
	query;
	/**
	* Creates a subquery that defines a temporary named result set as a CTE.
	*
	* It is useful for breaking down complex queries into simpler parts and for reusing the result set in subsequent parts of the query.
	*
	* See docs: {@link https://orm.drizzle.team/docs/select#with-clause}
	*
	* @param alias The alias for the subquery.
	*
	* Failure to provide an alias will result in a DrizzleTypeError, preventing the subquery from being referenced in other queries.
	*
	* @example
	*
	* ```ts
	* // Create a subquery with alias 'sq' and use it in the select query
	* const sq = db.$with('sq').as(db.select().from(users).where(eq(users.id, 42)));
	*
	* const result = await db.with(sq).select().from(sq);
	* ```
	*
	* To select arbitrary SQL values as fields in a CTE and reference them in other CTEs or in the main query, you need to add aliases to them:
	*
	* ```ts
	* // Select an arbitrary SQL value as a field in a CTE and reference it in the main query
	* const sq = db.$with('sq').as(db.select({
	*   name: sql<string>`upper(${users.name})`.as('name'),
	* })
	* .from(users));
	*
	* const result = await db.with(sq).select({ name: sq.name }).from(sq);
	* ```
	*/
	$with = (alias, selection) => {
		const self = this;
		const as = (qb) => {
			if (typeof qb === "function") qb = qb(new QueryBuilder(self.dialect));
			return new Proxy(new WithSubquery(qb.getSQL(), selection ?? ("getSelectedFields" in qb ? qb.getSelectedFields() ?? {} : {}), alias, true), new SelectionProxyHandler({
				alias,
				sqlAliasedBehavior: "alias",
				sqlBehavior: "error"
			}));
		};
		return { as };
	};
	$count(source, filters) {
		return new SQLiteCountBuilder({
			source,
			filters,
			session: this.session
		});
	}
	/**
	* Incorporates a previously defined CTE (using `$with`) into the main query.
	*
	* This method allows the main query to reference a temporary named result set.
	*
	* See docs: {@link https://orm.drizzle.team/docs/select#with-clause}
	*
	* @param queries The CTEs to incorporate into the main query.
	*
	* @example
	*
	* ```ts
	* // Define a subquery 'sq' as a CTE using $with
	* const sq = db.$with('sq').as(db.select().from(users).where(eq(users.id, 42)));
	*
	* // Incorporate the CTE 'sq' into the main query and select from it
	* const result = await db.with(sq).select().from(sq);
	* ```
	*/
	with(...queries) {
		const self = this;
		function select(fields) {
			return new SQLiteSelectBuilder({
				fields: fields ?? void 0,
				session: self.session,
				dialect: self.dialect,
				withList: queries
			});
		}
		function selectDistinct(fields) {
			return new SQLiteSelectBuilder({
				fields: fields ?? void 0,
				session: self.session,
				dialect: self.dialect,
				withList: queries,
				distinct: true
			});
		}
		function update(table) {
			return new SQLiteUpdateBuilder(table, self.session, self.dialect, queries);
		}
		function insert(into) {
			return new SQLiteInsertBuilder(into, self.session, self.dialect, queries);
		}
		function delete_(from) {
			return new SQLiteDeleteBase(from, self.session, self.dialect, queries);
		}
		return {
			select,
			selectDistinct,
			update,
			insert,
			delete: delete_
		};
	}
	select(fields) {
		return new SQLiteSelectBuilder({
			fields: fields ?? void 0,
			session: this.session,
			dialect: this.dialect
		});
	}
	selectDistinct(fields) {
		return new SQLiteSelectBuilder({
			fields: fields ?? void 0,
			session: this.session,
			dialect: this.dialect,
			distinct: true
		});
	}
	/**
	* Creates an update query.
	*
	* Calling this method without `.where()` clause will update all rows in a table. The `.where()` clause specifies which rows should be updated.
	*
	* Use `.set()` method to specify which values to update.
	*
	* See docs: {@link https://orm.drizzle.team/docs/update}
	*
	* @param table The table to update.
	*
	* @example
	*
	* ```ts
	* // Update all rows in the 'cars' table
	* await db.update(cars).set({ color: 'red' });
	*
	* // Update rows with filters and conditions
	* await db.update(cars).set({ color: 'red' }).where(eq(cars.brand, 'BMW'));
	*
	* // Update with returning clause
	* const updatedCar: Car[] = await db.update(cars)
	*   .set({ color: 'red' })
	*   .where(eq(cars.id, 1))
	*   .returning();
	* ```
	*/
	update(table) {
		return new SQLiteUpdateBuilder(table, this.session, this.dialect);
	}
	$cache;
	/**
	* Creates an insert query.
	*
	* Calling this method will create new rows in a table. Use `.values()` method to specify which values to insert.
	*
	* See docs: {@link https://orm.drizzle.team/docs/insert}
	*
	* @param table The table to insert into.
	*
	* @example
	*
	* ```ts
	* // Insert one row
	* await db.insert(cars).values({ brand: 'BMW' });
	*
	* // Insert multiple rows
	* await db.insert(cars).values([{ brand: 'BMW' }, { brand: 'Porsche' }]);
	*
	* // Insert with returning clause
	* const insertedCar: Car[] = await db.insert(cars)
	*   .values({ brand: 'BMW' })
	*   .returning();
	* ```
	*/
	insert(into) {
		return new SQLiteInsertBuilder(into, this.session, this.dialect);
	}
	/**
	* Creates a delete query.
	*
	* Calling this method without `.where()` clause will delete all rows in a table. The `.where()` clause specifies which rows should be deleted.
	*
	* See docs: {@link https://orm.drizzle.team/docs/delete}
	*
	* @param table The table to delete from.
	*
	* @example
	*
	* ```ts
	* // Delete all rows in the 'cars' table
	* await db.delete(cars);
	*
	* // Delete rows with filters and conditions
	* await db.delete(cars).where(eq(cars.color, 'green'));
	*
	* // Delete with returning clause
	* const deletedCar: Car[] = await db.delete(cars)
	*   .where(eq(cars.id, 1))
	*   .returning();
	* ```
	*/
	delete(from) {
		return new SQLiteDeleteBase(from, this.session, this.dialect);
	}
	run(query) {
		const sequel = typeof query === "string" ? sql.raw(query) : query.getSQL();
		if (this.resultKind === "async") return new SQLiteRaw(async () => this.session.run(sequel), () => sequel, "run", this.dialect, this.session.extractRawRunValueFromBatchResult.bind(this.session));
		return this.session.run(sequel);
	}
	all(query) {
		const sequel = typeof query === "string" ? sql.raw(query) : query.getSQL();
		if (this.resultKind === "async") return new SQLiteRaw(async () => this.session.all(sequel), () => sequel, "all", this.dialect, this.session.extractRawAllValueFromBatchResult.bind(this.session));
		return this.session.all(sequel);
	}
	get(query) {
		const sequel = typeof query === "string" ? sql.raw(query) : query.getSQL();
		if (this.resultKind === "async") return new SQLiteRaw(async () => this.session.get(sequel), () => sequel, "get", this.dialect, this.session.extractRawGetValueFromBatchResult.bind(this.session));
		return this.session.get(sequel);
	}
	values(query) {
		const sequel = typeof query === "string" ? sql.raw(query) : query.getSQL();
		if (this.resultKind === "async") return new SQLiteRaw(async () => this.session.values(sequel), () => sequel, "values", this.dialect, this.session.extractRawValuesValueFromBatchResult.bind(this.session));
		return this.session.values(sequel);
	}
	transaction(transaction, config) {
		return this.session.transaction(transaction, config);
	}
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/cache/core/cache.js
var Cache = class {
	static [entityKind] = "Cache";
};
var NoopCache = class extends Cache {
	strategy() {
		return "all";
	}
	static [entityKind] = "NoopCache";
	async get(_key) {}
	async put(_hashedQuery, _response, _tables, _config) {}
	async onMutate(_params) {}
};
async function hashQuery(sql, params) {
	const dataToHash = `${sql}-${JSON.stringify(params)}`;
	const data = new TextEncoder().encode(dataToHash);
	const hashBuffer = await crypto.subtle.digest("SHA-256", data);
	return [...new Uint8Array(hashBuffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/sqlite-core/session.js
var ExecuteResultSync = class extends QueryPromise {
	constructor(resultCb) {
		super();
		this.resultCb = resultCb;
	}
	static [entityKind] = "ExecuteResultSync";
	async execute() {
		return this.resultCb();
	}
	sync() {
		return this.resultCb();
	}
};
var SQLitePreparedQuery = class {
	constructor(mode, executeMethod, query, cache, queryMetadata, cacheConfig) {
		this.mode = mode;
		this.executeMethod = executeMethod;
		this.query = query;
		this.cache = cache;
		this.queryMetadata = queryMetadata;
		this.cacheConfig = cacheConfig;
		if (cache && cache.strategy() === "all" && cacheConfig === void 0) this.cacheConfig = {
			enable: true,
			autoInvalidate: true
		};
		if (!this.cacheConfig?.enable) this.cacheConfig = void 0;
	}
	static [entityKind] = "PreparedQuery";
	/** @internal */
	joinsNotNullableMap;
	/** @internal */
	async queryWithCache(queryString, params, query) {
		if (this.cache === void 0 || is(this.cache, NoopCache) || this.queryMetadata === void 0) try {
			return await query();
		} catch (e) {
			throw new DrizzleQueryError(queryString, params, e);
		}
		if (this.cacheConfig && !this.cacheConfig.enable) try {
			return await query();
		} catch (e) {
			throw new DrizzleQueryError(queryString, params, e);
		}
		if ((this.queryMetadata.type === "insert" || this.queryMetadata.type === "update" || this.queryMetadata.type === "delete") && this.queryMetadata.tables.length > 0) try {
			const [res] = await Promise.all([query(), this.cache.onMutate({ tables: this.queryMetadata.tables })]);
			return res;
		} catch (e) {
			throw new DrizzleQueryError(queryString, params, e);
		}
		if (!this.cacheConfig) try {
			return await query();
		} catch (e) {
			throw new DrizzleQueryError(queryString, params, e);
		}
		if (this.queryMetadata.type === "select") {
			const fromCache = await this.cache.get(this.cacheConfig.tag ?? await hashQuery(queryString, params), this.queryMetadata.tables, this.cacheConfig.tag !== void 0, this.cacheConfig.autoInvalidate);
			if (fromCache === void 0) {
				let result;
				try {
					result = await query();
				} catch (e) {
					throw new DrizzleQueryError(queryString, params, e);
				}
				await this.cache.put(this.cacheConfig.tag ?? await hashQuery(queryString, params), result, this.cacheConfig.autoInvalidate ? this.queryMetadata.tables : [], this.cacheConfig.tag !== void 0, this.cacheConfig.config);
				return result;
			}
			return fromCache;
		}
		try {
			return await query();
		} catch (e) {
			throw new DrizzleQueryError(queryString, params, e);
		}
	}
	getQuery() {
		return this.query;
	}
	mapRunResult(result, _isFromBatch) {
		return result;
	}
	mapAllResult(_result, _isFromBatch) {
		throw new Error("Not implemented");
	}
	mapGetResult(_result, _isFromBatch) {
		throw new Error("Not implemented");
	}
	execute(placeholderValues) {
		if (this.mode === "async") return this[this.executeMethod](placeholderValues);
		return new ExecuteResultSync(() => this[this.executeMethod](placeholderValues));
	}
	mapResult(response, isFromBatch) {
		switch (this.executeMethod) {
			case "run": return this.mapRunResult(response, isFromBatch);
			case "all": return this.mapAllResult(response, isFromBatch);
			case "get": return this.mapGetResult(response, isFromBatch);
		}
	}
};
var SQLiteSession = class {
	constructor(dialect) {
		this.dialect = dialect;
	}
	static [entityKind] = "SQLiteSession";
	prepareOneTimeQuery(query, fields, executeMethod, isResponseInArrayMode, customResultMapper, queryMetadata, cacheConfig) {
		return this.prepareQuery(query, fields, executeMethod, isResponseInArrayMode, customResultMapper, queryMetadata, cacheConfig);
	}
	run(query) {
		const staticQuery = this.dialect.sqlToQuery(query);
		try {
			return this.prepareOneTimeQuery(staticQuery, void 0, "run", false).run();
		} catch (err) {
			throw new DrizzleError({
				cause: err,
				message: `Failed to run the query '${staticQuery.sql}'`
			});
		}
	}
	/** @internal */
	extractRawRunValueFromBatchResult(result) {
		return result;
	}
	all(query) {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), void 0, "run", false).all();
	}
	/** @internal */
	extractRawAllValueFromBatchResult(_result) {
		throw new Error("Not implemented");
	}
	get(query) {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), void 0, "run", false).get();
	}
	/** @internal */
	extractRawGetValueFromBatchResult(_result) {
		throw new Error("Not implemented");
	}
	values(query) {
		return this.prepareOneTimeQuery(this.dialect.sqlToQuery(query), void 0, "run", false).values();
	}
	async count(sql) {
		return (await this.values(sql))[0][0];
	}
	/** @internal */
	extractRawValuesValueFromBatchResult(_result) {
		throw new Error("Not implemented");
	}
};
var SQLiteTransaction = class extends BaseSQLiteDatabase {
	constructor(resultType, dialect, session, schema, nestedIndex = 0) {
		super(resultType, dialect, session, schema);
		this.schema = schema;
		this.nestedIndex = nestedIndex;
	}
	static [entityKind] = "SQLiteTransaction";
	rollback() {
		throw new TransactionRollbackError();
	}
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/better-sqlite3/session.js
var BetterSQLiteSession = class extends SQLiteSession {
	constructor(client, dialect, schema, options = {}) {
		super(dialect);
		this.client = client;
		this.schema = schema;
		this.logger = options.logger ?? new NoopLogger();
		this.cache = options.cache ?? new NoopCache();
	}
	static [entityKind] = "BetterSQLiteSession";
	logger;
	cache;
	prepareQuery(query, fields, executeMethod, isResponseInArrayMode, customResultMapper, queryMetadata, cacheConfig) {
		return new PreparedQuery(this.client.prepare(query.sql), query, this.logger, this.cache, queryMetadata, cacheConfig, fields, executeMethod, isResponseInArrayMode, customResultMapper);
	}
	transaction(transaction, config = {}) {
		const tx = new BetterSQLiteTransaction("sync", this.dialect, this, this.schema);
		return this.client.transaction(transaction)[config.behavior ?? "deferred"](tx);
	}
};
var BetterSQLiteTransaction = class BetterSQLiteTransaction extends SQLiteTransaction {
	static [entityKind] = "BetterSQLiteTransaction";
	transaction(transaction) {
		const savepointName = `sp${this.nestedIndex}`;
		const tx = new BetterSQLiteTransaction("sync", this.dialect, this.session, this.schema, this.nestedIndex + 1);
		this.session.run(sql.raw(`savepoint ${savepointName}`));
		try {
			const result = transaction(tx);
			this.session.run(sql.raw(`release savepoint ${savepointName}`));
			return result;
		} catch (err) {
			this.session.run(sql.raw(`rollback to savepoint ${savepointName}`));
			throw err;
		}
	}
};
var PreparedQuery = class extends SQLitePreparedQuery {
	constructor(stmt, query, logger, cache, queryMetadata, cacheConfig, fields, executeMethod, _isResponseInArrayMode, customResultMapper) {
		super("sync", executeMethod, query, cache, queryMetadata, cacheConfig);
		this.stmt = stmt;
		this.logger = logger;
		this.fields = fields;
		this._isResponseInArrayMode = _isResponseInArrayMode;
		this.customResultMapper = customResultMapper;
	}
	static [entityKind] = "BetterSQLitePreparedQuery";
	run(placeholderValues) {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		return this.stmt.run(...params);
	}
	all(placeholderValues) {
		const { fields, joinsNotNullableMap, query, logger, stmt, customResultMapper } = this;
		if (!fields && !customResultMapper) {
			const params = fillPlaceholders(query.params, placeholderValues ?? {});
			logger.logQuery(query.sql, params);
			return stmt.all(...params);
		}
		const rows = this.values(placeholderValues);
		if (customResultMapper) return customResultMapper(rows);
		return rows.map((row) => mapResultRow(fields, row, joinsNotNullableMap));
	}
	get(placeholderValues) {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		const { fields, stmt, joinsNotNullableMap, customResultMapper } = this;
		if (!fields && !customResultMapper) return stmt.get(...params);
		const row = stmt.raw().get(...params);
		if (!row) return;
		if (customResultMapper) return customResultMapper([row]);
		return mapResultRow(fields, row, joinsNotNullableMap);
	}
	values(placeholderValues) {
		const params = fillPlaceholders(this.query.params, placeholderValues ?? {});
		this.logger.logQuery(this.query.sql, params);
		return this.stmt.raw().all(...params);
	}
	/** @internal */
	isResponseInArrayMode() {
		return this._isResponseInArrayMode;
	}
};

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/better-sqlite3/driver.js
var BetterSQLite3Database = class extends BaseSQLiteDatabase {
	static [entityKind] = "BetterSQLite3Database";
};
function construct(client, config = {}) {
	const dialect = new SQLiteSyncDialect({ casing: config.casing });
	let logger;
	if (config.logger === true) logger = new DefaultLogger();
	else if (config.logger !== false) logger = config.logger;
	let schema;
	if (config.schema) {
		const tablesConfig = extractTablesRelationalConfig(config.schema, createTableRelationsHelpers);
		schema = {
			fullSchema: config.schema,
			schema: tablesConfig.tables,
			tableNamesMap: tablesConfig.tableNamesMap
		};
	}
	const db = new BetterSQLite3Database("sync", dialect, new BetterSQLiteSession(client, dialect, schema, { logger }), schema);
	db.$client = client;
	return db;
}
function drizzle(...params) {
	if (params[0] === void 0 || typeof params[0] === "string") return construct(params[0] === void 0 ? new Database() : new Database(params[0]), params[1]);
	if (isConfig(params[0])) {
		const { connection, client, ...drizzleConfig } = params[0];
		if (client) return construct(client, drizzleConfig);
		if (typeof connection === "object") {
			const { source, ...options } = connection;
			return construct(new Database(source, options), drizzleConfig);
		}
		return construct(new Database(connection), drizzleConfig);
	}
	return construct(params[0], params[1]);
}
((drizzle2) => {
	function mock(config) {
		return construct({}, config);
	}
	drizzle2.mock = mock;
})(drizzle || (drizzle = {}));

//#endregion
//#region src/db/schema.ts
var schema_exports = /* @__PURE__ */ __exportAll({
	AI_MESSAGES_SDK_VERSION: () => AI_MESSAGES_SDK_VERSION,
	appCollections: () => appCollections,
	appCollectionsRelations: () => appCollectionsRelations,
	appPrompts: () => appPrompts,
	apps: () => apps,
	appsRelations: () => appsRelations,
	blockchainNetworks: () => blockchainNetworks,
	chats: () => chats,
	chatsRelations: () => chatsRelations,
	customThemes: () => customThemes,
	languageModelProvidersRelations: () => languageModelProvidersRelations,
	languageModelsRelations: () => languageModelsRelations,
	language_model_providers: () => language_model_providers,
	language_models: () => language_models,
	mcpServers: () => mcpServers,
	mcpToolConsents: () => mcpToolConsents,
	messages: () => messages,
	messagesRelations: () => messagesRelations,
	prompts: () => prompts,
	versions: () => versions,
	versionsRelations: () => versionsRelations
});
const AI_MESSAGES_SDK_VERSION = "ai@v6";
const prompts = sqliteTable("prompts", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	title: text("title").notNull(),
	description: text("description"),
	content: text("content").notNull(),
	slug: text("slug"),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`)
}, (table) => [unique("prompts_slug_unique").on(table.slug)]);
const appPrompts = sqliteTable("app_prompts", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	appId: integer("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
	promptId: integer("prompt_id").notNull().references(() => prompts.id, { onDelete: "cascade" }),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`)
}, (table) => [unique("uniq_app_prompt").on(table.appId, table.promptId)]);
const appCollections = sqliteTable("app_collections", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`)
}, (table) => [unique("app_collections_name_unique").on(table.name)]);
const apps = sqliteTable("apps", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	path: text("path").notNull(),
	framework: text("framework").notNull().default("blank").$type(),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
	githubOrg: text("github_org"),
	githubRepo: text("github_repo"),
	githubBranch: text("github_branch"),
	supabaseProjectId: text("supabase_project_id"),
	supabaseParentProjectId: text("supabase_parent_project_id"),
	supabaseOrganizationSlug: text("supabase_organization_slug"),
	supabaseTestUserId: text("supabase_test_user_id"),
	neonProjectId: text("neon_project_id"),
	neonDevelopmentBranchId: text("neon_development_branch_id"),
	neonPreviewBranchId: text("neon_preview_branch_id"),
	neonActiveBranchId: text("neon_active_branch_id"),
	neonTestBranchId: text("neon_test_branch_id"),
	neonProductionAuthCookieSecret: text("neon_production_auth_cookie_secret"),
	neonDevelopmentAuthCookieSecret: text("neon_development_auth_cookie_secret"),
	selectedDatabaseBranchType: text("selected_database_branch_type").$type(),
	vercelProjectId: text("vercel_project_id"),
	vercelProjectName: text("vercel_project_name"),
	vercelTeamId: text("vercel_team_id"),
	vercelDeploymentUrl: text("vercel_deployment_url"),
	installCommand: text("install_command"),
	startCommand: text("start_command"),
	appIdentity: text("app_identity", { mode: "json" }).$type(),
	chatContext: text("chat_context", { mode: "json" }),
	isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(sql`0`),
	themeId: text("theme_id"),
	needsAppBlueprint: integer("needs_app_blueprint", { mode: "boolean" }).notNull().default(sql`0`),
	testingEnabled: integer("testing_enabled", { mode: "boolean" }).notNull().default(sql`0`),
	collectionId: integer("collection_id").references(() => appCollections.id, { onDelete: "set null" }),
	sourceType: text("source_type", { enum: [
		"local",
		"imported",
		"received"
	] }).notNull().default("local"),
	receivedAt: integer("received_at", { mode: "timestamp" }),
	sourceShareId: text("source_share_id"),
	originProjectId: text("origin_project_id"),
	sharedByDisplayName: text("shared_by_display_name"),
	packageChecksum: text("package_checksum")
}, (table) => [index("apps_source_type_idx").on(table.sourceType), index("apps_source_share_id_idx").on(table.sourceShareId)]);
const chats = sqliteTable("chats", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	appId: integer("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
	title: text("title"),
	initialCommitHash: text("initial_commit_hash"),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
	compactedAt: integer("compacted_at", { mode: "timestamp" }),
	compactionBackupPath: text("compaction_backup_path"),
	pendingCompaction: integer("pending_compaction", { mode: "boolean" }),
	chatMode: text("chat_mode").$type()
});
const messages = sqliteTable("messages", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	chatId: integer("chat_id").notNull().references(() => chats.id, { onDelete: "cascade" }),
	role: text("role", { enum: ["user", "assistant"] }).notNull(),
	content: text("content").notNull(),
	approvalState: text("approval_state", { enum: ["approved", "rejected"] }),
	sourceCommitHash: text("source_commit_hash"),
	commitHash: text("commit_hash"),
	requestId: text("request_id"),
	maxTokensUsed: integer("max_tokens_used"),
	model: text("model"),
	aiMessagesJson: text("ai_messages_json", { mode: "json" }).$type(),
	usingFreeAgentModeQuota: integer("using_free_agent_mode_quota", { mode: "boolean" }),
	isCompactionSummary: integer("is_compaction_summary", { mode: "boolean" }),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`)
});
const versions = sqliteTable("versions", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	appId: integer("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
	commitHash: text("commit_hash").notNull(),
	neonDbTimestamp: text("neon_db_timestamp"),
	isFavorite: integer("is_favorite", { mode: "boolean" }).notNull().default(sql`0`),
	note: text("note"),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`)
}, (table) => [unique("versions_app_commit_unique").on(table.appId, table.commitHash)]);
const appsRelations = relations(apps, ({ many, one }) => ({
	chats: many(chats),
	versions: many(versions),
	collection: one(appCollections, {
		fields: [apps.collectionId],
		references: [appCollections.id]
	})
}));
const appCollectionsRelations = relations(appCollections, ({ many }) => ({ apps: many(apps) }));
const chatsRelations = relations(chats, ({ many, one }) => ({
	messages: many(messages),
	app: one(apps, {
		fields: [chats.appId],
		references: [apps.id]
	})
}));
const messagesRelations = relations(messages, ({ one }) => ({ chat: one(chats, {
	fields: [messages.chatId],
	references: [chats.id]
}) }));
const language_model_providers = sqliteTable("language_model_providers", {
	id: text("id").primaryKey(),
	name: text("name").notNull(),
	api_base_url: text("api_base_url").notNull(),
	env_var_name: text("env_var_name"),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`)
});
const language_models = sqliteTable("language_models", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	displayName: text("display_name").notNull(),
	apiName: text("api_name").notNull(),
	builtinProviderId: text("builtin_provider_id"),
	customProviderId: text("custom_provider_id").references(() => language_model_providers.id, { onDelete: "cascade" }),
	description: text("description"),
	max_output_tokens: integer("max_output_tokens"),
	context_window: integer("context_window"),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`)
});
const languageModelProvidersRelations = relations(language_model_providers, ({ many }) => ({ languageModels: many(language_models) }));
const languageModelsRelations = relations(language_models, ({ one }) => ({ provider: one(language_model_providers, {
	fields: [language_models.customProviderId],
	references: [language_model_providers.id]
}) }));
const versionsRelations = relations(versions, ({ one }) => ({ app: one(apps, {
	fields: [versions.appId],
	references: [apps.id]
}) }));
const mcpServers = sqliteTable("mcp_servers", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	transport: text("transport").notNull(),
	command: text("command"),
	args: text("args", { mode: "json" }).$type(),
	envJson: text("env_json", { mode: "json" }).$type(),
	headersJson: text("headers_json", { mode: "json" }).$type(),
	url: text("url"),
	enabled: integer("enabled", { mode: "boolean" }).notNull().default(sql`0`),
	oauthEnabled: integer("oauth_enabled", { mode: "boolean" }).notNull().default(sql`0`),
	oauthState: text("oauth_state"),
	oauthClientId: text("oauth_client_id"),
	oauthClientSecret: text("oauth_client_secret"),
	oauthScope: text("oauth_scope"),
	oauthCallbackPort: integer("oauth_callback_port"),
	bearerToken: text("bearer_token"),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`)
});
const mcpToolConsents = sqliteTable("mcp_tool_consents", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	serverId: integer("server_id").notNull().references(() => mcpServers.id, { onDelete: "cascade" }),
	toolName: text("tool_name").notNull(),
	consent: text("consent").notNull().default("ask"),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`)
}, (table) => [unique("uniq_mcp_consent").on(table.serverId, table.toolName)]);
const blockchainNetworks = sqliteTable("blockchain_networks", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	appId: integer("app_id").notNull().references(() => apps.id, { onDelete: "cascade" }),
	chainType: text("chain_type", { enum: ["solana", "evm"] }).notNull(),
	chainId: text("chain_id").notNull(),
	chainName: text("chain_name").notNull(),
	rpcUrl: text("rpc_url").notNull(),
	explorerUrl: text("explorer_url"),
	isActive: integer("is_active", { mode: "boolean" }).notNull().default(true),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`)
});
const customThemes = sqliteTable("custom_themes", {
	id: integer("id").primaryKey({ autoIncrement: true }),
	name: text("name").notNull(),
	description: text("description"),
	prompt: text("prompt").notNull(),
	createdAt: integer("created_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`),
	updatedAt: integer("updated_at", { mode: "timestamp" }).notNull().default(sql`(unixepoch())`)
});

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/migrator.js
function readMigrationFiles(config) {
	const migrationFolderTo = config.migrationsFolder;
	const migrationQueries = [];
	const journalPath = `${migrationFolderTo}/meta/_journal.json`;
	if (!fs.existsSync(journalPath)) throw new Error(`Can't find meta/_journal.json file`);
	const journalAsString = fs.readFileSync(`${migrationFolderTo}/meta/_journal.json`).toString();
	const journal = JSON.parse(journalAsString);
	for (const journalEntry of journal.entries) {
		const migrationPath = `${migrationFolderTo}/${journalEntry.tag}.sql`;
		try {
			const query = fs.readFileSync(`${migrationFolderTo}/${journalEntry.tag}.sql`).toString();
			const result = query.split("--> statement-breakpoint").map((it) => {
				return it;
			});
			migrationQueries.push({
				sql: result,
				bps: journalEntry.breakpoints,
				folderMillis: journalEntry.when,
				hash: crypto$1.createHash("sha256").update(query).digest("hex")
			});
		} catch {
			throw new Error(`No file ${migrationPath} found in ${migrationFolderTo} folder`);
		}
	}
	return migrationQueries;
}

//#endregion
//#region ../../node_modules/.bun/drizzle-orm@0.45.2+086666341307449b/node_modules/drizzle-orm/better-sqlite3/migrator.js
function migrate(db, config) {
	const migrations = readMigrationFiles(config);
	db.dialect.migrate(migrations, db.session, config);
}

//#endregion
//#region src/db/index.ts
var import_src = /* @__PURE__ */ __toESM(require_src(), 1);
const logger = import_src.default.scope("db");
let _db = null;
/**
* Get the database path based on the current environment
*/
function getDatabasePath() {
	return path.join(getUserDataPath(), "sqlite.db");
}
function getDatabaseFilePaths() {
	const dbPath = getDatabasePath();
	return [
		dbPath,
		`${dbPath}-wal`,
		`${dbPath}-shm`
	];
}
/**
* Initialize the database connection
*/
function initializeDatabase() {
	if (_db) return _db;
	const dbPath = getDatabasePath();
	logger.log("Initializing database at:", dbPath);
	try {
		if (fs.existsSync(dbPath)) {
			if (fs.statSync(dbPath).size < 100) {
				logger.log("Database file exists but may be corrupted. Removing it...");
				fs.unlinkSync(dbPath);
			}
		}
	} catch (error) {
		logger.error("Error checking database file:", error);
	}
	fs.mkdirSync(getUserDataPath(), { recursive: true });
	const sqlite = new Database(dbPath, { timeout: 1e4 });
	sqlite.pragma("foreign_keys = ON");
	try {
		sqlite.pragma("journal_mode = WAL");
	} catch (error) {
		logger.warn("Could not enable WAL mode, falling back to default journal mode:", error);
	}
	_db = drizzle(sqlite, { schema: schema_exports });
	try {
		let migrationsFolder = process.env.CAIDE_ENGINE_DRIZZLE_DIR ?? null;
		if (migrationsFolder === null) for (let dir = fileURLToPath(new URL(".", import.meta.url)); dir !== path.parse(dir).root; dir = path.dirname(dir)) {
			const candidate = path.join(dir, "drizzle");
			if (fs.existsSync(candidate)) {
				migrationsFolder = candidate;
				break;
			}
		}
		if (!migrationsFolder) throw new Error("Migrations folder not found: searched upward from " + fileURLToPath(new URL(".", import.meta.url)));
		if (!fs.existsSync(path.join(migrationsFolder, "meta"))) throw new Error("Migrations folder missing drizzle meta: " + migrationsFolder);
		logger.log("Running migrations from:", migrationsFolder);
		migrate(_db, { migrationsFolder });
		if (!sqlite.prepare("PRAGMA table_info(apps)").all().some((column) => column.name === "framework")) sqlite.exec("ALTER TABLE apps ADD COLUMN framework TEXT NOT NULL DEFAULT 'blank'");
	} catch (error) {
		logger.error("Migration error:", error);
		_db = null;
		sqlite.close();
		throw error;
	}
	return _db;
}
function closeDatabase() {
	if (!_db) return;
	const database = _db;
	_db = null;
	database.$client.close();
}
/**
* Get the database instance (throws if not initialized)
*/
function getDb() {
	if (!_db) throw new Error("Database not initialized. Call initializeDatabase() first.");
	return _db;
}
const db = new Proxy({}, { get(target, prop) {
	return getDb()[prop];
} });

//#endregion
//#region src/lib/utils.ts
/**
* Generates a cute app name.
*/
function generateCuteAppName() {
	const adjectives = [
		"happy",
		"gentle",
		"brave",
		"clever",
		"swift",
		"bright",
		"calm",
		"nimble",
		"sleepy",
		"fluffy",
		"wild",
		"tiny",
		"bold",
		"wise",
		"merry",
		"quick",
		"busy",
		"silent",
		"cozy",
		"jolly",
		"playful",
		"friendly",
		"curious",
		"peaceful",
		"silly",
		"dazzling",
		"graceful",
		"elegant",
		"cosmic",
		"whispering",
		"dancing",
		"sparkling",
		"mystical",
		"vibrant",
		"radiant",
		"dreamy",
		"patient",
		"energetic",
		"vigilant",
		"sincere",
		"electric",
		"stellar",
		"lunar",
		"serene",
		"mighty",
		"magical",
		"neon",
		"azure",
		"crimson",
		"emerald",
		"golden",
		"jade",
		"crystal",
		"snuggly",
		"glowing",
		"wandering",
		"whistling",
		"bubbling",
		"floating",
		"flying",
		"hopping"
	];
	const animals = [
		"fox",
		"panda",
		"rabbit",
		"wolf",
		"bear",
		"owl",
		"koala",
		"beaver",
		"ferret",
		"squirrel",
		"zebra",
		"tiger",
		"lynx",
		"lemur",
		"penguin",
		"otter",
		"hedgehog",
		"deer",
		"badger",
		"raccoon",
		"turtle",
		"dolphin",
		"eagle",
		"falcon",
		"parrot",
		"capybara",
		"axolotl",
		"narwhal",
		"wombat",
		"meerkat",
		"platypus",
		"mongoose",
		"chinchilla",
		"quokka",
		"alpaca",
		"chameleon",
		"ocelot",
		"manatee",
		"puffin",
		"shiba",
		"sloth",
		"gecko",
		"hummingbird",
		"mantis",
		"jellyfish",
		"pangolin",
		"okapi",
		"binturong",
		"tardigrade",
		"beluga",
		"kiwi",
		"octopus",
		"salamander",
		"seahorse",
		"kookaburra",
		"gibbon",
		"jackrabbit",
		"lobster",
		"iguana",
		"tamarin",
		"armadillo",
		"starfish",
		"walrus",
		"phoenix",
		"griffin",
		"dragon",
		"unicorn",
		"kraken"
	];
	const verbs = [
		"run",
		"hop",
		"dash",
		"zoom",
		"skip",
		"jump",
		"glow",
		"play",
		"chirp",
		"buzz",
		"flip",
		"flit",
		"soar",
		"dive",
		"swim",
		"climb",
		"sprint",
		"wiggle",
		"twirl",
		"pounce",
		"bop",
		"spin",
		"hum",
		"roll",
		"blink",
		"skid",
		"kick",
		"drift",
		"bloom",
		"burst",
		"slide",
		"bounce",
		"crawl",
		"sniff",
		"peek",
		"scurry",
		"nudge",
		"snap",
		"swoop",
		"roam",
		"trot",
		"dart",
		"yawn",
		"snore",
		"hug",
		"nap",
		"chase",
		"rest",
		"wag",
		"bob",
		"beam",
		"cheer"
	];
	return `${adjectives[Math.floor(Math.random() * adjectives.length)]}-${animals[Math.floor(Math.random() * animals.length)]}-${verbs[Math.floor(Math.random() * verbs.length)]}`;
}

//#endregion
//#region src/shared/goal_state.ts
const PersistedGoalTaskStateSchema = object({
	id: string().min(1),
	title: string().min(1),
	description: string().default(""),
	status: _enum([
		"pending",
		"ready",
		"running",
		"verifying",
		"repairing",
		"blocked",
		"awaiting-approval",
		"verified",
		"skipped",
		"cancelled"
	]),
	order: number().int().nonnegative(),
	required: boolean().default(true),
	dependencies: array(string()).default([]),
	completionCriteria: array(string()).default([]),
	verificationMethod: string().nullable().default(null)
});
const PersistedGoalEvidenceSchema = object({
	id: string().min(1),
	taskId: string().nullable().default(null),
	kind: _enum([
		"test",
		"build",
		"typecheck",
		"lint",
		"screenshot",
		"audit-report",
		"file-change",
		"command-output",
		"deployment",
		"manual-confirmation",
		"other"
	]),
	label: string().min(1),
	reference: string().min(1),
	passed: boolean(),
	revision: string().nullable().default(null),
	createdAt: number()
});
const PersistedGoalVerificationCriterionSchema = object({
	criterion: string().min(1),
	passed: boolean(),
	evidence: array(string())
});
const PersistedGoalStateSchema = object({
	version: number().describe("Must be 1"),
	goalId: string().min(1),
	objective: string().min(1),
	status: _enum([
		"active",
		"blocked",
		"awaiting-user",
		"completion-candidate",
		"completed"
	]),
	currentPhase: string().nullable(),
	currentTask: string().nullable(),
	tasks: array(PersistedGoalTaskStateSchema),
	evidence: array(PersistedGoalEvidenceSchema),
	steering: array(object({
		instruction: string().min(1),
		createdAt: number()
	})).default([]),
	blocker: object({
		reason: string().min(1),
		userAction: string().nullable(),
		retryable: boolean(),
		detectedAt: number()
	}).nullable(),
	verification: object({
		passed: boolean(),
		checkedAt: number().nullable(),
		revision: string().nullable(),
		criteria: array(PersistedGoalVerificationCriterionSchema)
	}),
	updatedAt: number()
});
function isPersistedGoalComplete(state) {
	const requiredTasksPass = state.tasks.filter((task) => task.required).every((task) => task.status === "verified");
	const verificationRevision = state.verification.revision;
	const evidenceById = new Map(state.evidence.map((evidence) => [evidence.id, evidence]));
	const criteriaPass = state.verification.criteria.length > 0 && verificationRevision !== null && state.verification.criteria.every((criterion) => {
		if (!criterion.passed || criterion.evidence.length === 0) return false;
		return criterion.evidence.every((evidenceId) => {
			const evidence = evidenceById.get(evidenceId);
			return evidence?.passed === true && evidence.revision === verificationRevision;
		});
	});
	return state.status === "completed" && requiredTasksPass && state.verification.passed && state.verification.checkedAt !== null && verificationRevision !== null && criteriaPass;
}

//#endregion
export { and as C, isNull as D, isNotNull as E, like as O, desc as S, inArray as T, mcpServers as _, closeDatabase as a, prompts as b, initializeDatabase as c, appPrompts as d, apps as f, language_models as g, language_model_providers as h, generateCuteAppName as i, sql as k, AI_MESSAGES_SDK_VERSION as l, customThemes as m, PersistedGoalStateSchema as n, db as o, chats as p, isPersistedGoalComplete as r, getDatabaseFilePaths as s, PersistedGoalEvidenceSchema as t, appCollections as u, mcpToolConsents as v, eq as w, versions as x, messages as y };