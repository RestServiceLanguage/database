const _ = require('lodash');
const DatabaseAdapter = require('./DatabaseAdapter');
const insertOrUpdate = require('./knex/insertOrUpdate');
const knex = require('knex');
const list = require('./knex/list');

const typeMapping = {
  'Integer': 'integer',
  'String': 'string',
  'Text': 'text',
  'Date': 'date',
  'Float': 'float',
  'Boolean': 'boolean'
};

module.exports = class KnexAdapter extends DatabaseAdapter {

  constructor({ client, connection }) {
    super();
    this.db = knex({
      client,
      connection
    });
  }

  async list({ type, filters = [], expands = [], limit = 100, offset = 0 }) {
    expands = _(expands)
      .map((expand) => _.find(type.properties, { name: expand }))
      .compact()
      .filter((expand) => _.isObject(expand.type))
      .value();

    const data = await list({
      type,
      filters,
      expands,
      database: this.db,
      limit,
      offset
    });

    return data;
  }

  async get({ type, id, expands = [] }) {
    return await this.list({
      type,
      filters: [`id=${id}`],
      expands
    });
  }

  async insert({ type, data }) {
    return await insertOrUpdate({
      type,
      data,
      db: this.db
    });
  }

  async update({ type, id, data }) {
    return await insertOrUpdate({
      type,
      id,
      data,
      db: this.db
    });
  }

  async remove({ type, id }) {
    return await this.db(type.name).where('id', id).del();
  }

  async _createTable(type) {
    const existingTable = await this.db.schema.hasTable(type.name);
    if (!existingTable) {
      await this.db.schema.createTable(type.name, this._createTypeTable.bind({ type, adapter: this }));
    }
  }

  async _createTypeTable(t) {
    t.increments();
    for (const property of this.type.properties) {
      if (_.isArray(property.type)) {
        this.adapter._createArrayTable(this.type, property);
      } else if (_.isUndefined(typeMapping[property.type])) {
        this.adapter._createColumn({
          t,
          type: 'integer',
          columnName: property.name,
          references: {
            ref: 'id',
            table: property.type.name
          }
        });
      } else {
        this.adapter._createColumn({
          t,
          type: typeMapping[property.type],
          columnName: property.name,
          uniq: property.uniq,
          nullable: property.nullable
        });
      }
    }
  }

  async _createArrayTable(type, property) {
    const tableName = `${type.name}_${property.name}`;
    const existingTable = await this.db.schema.hasTable(tableName);
    const valueType = property.type[0];

    if (!existingTable) {
      const adapter = this;

      await this.db.schema.createTable(tableName, (t) => {
        t.increments();
        t.integer(type.name).notNullable().references('id').inTable(type.name).onDelete('CASCADE').onUpdate('CASCADE');

        if (_.isUndefined(typeMapping[valueType])) {
          adapter._createColumn({
            t,
            type: 'integer',
            columnName: 'value',
            references: {
              ref: 'id',
              table: valueType.name
            }
          });
        } else {
          adapter._createColumn({
            t,
            type: typeMapping[valueType],
            columnName: 'value'
          });
        }
      });
    }
  }

  _createColumn({ t, type, columnName, uniq = false, nullable = false, references }) {
    const column = t[type](columnName);
    if (uniq) {
      column.unique();
    }

    if (nullable) {
      column.nullable();
    }

    if (!_.isUndefined(references)) {
      const { ref, table } = references;
      column.references(ref).inTable(table);
    }
  }

};
