const _ = require('lodash');

class DatabaseType {

  constructor(type, factory) {
    this.type = type;
    this.factory = factory;
    this._dependencies = this._collectDependencies();
    this._isResolved = false;
  }

  _collectDependencies() {
    const name = this.type;

    return _(this.type.properties)
      .map((property) => _.isArray(property.type) ? property.type[0] : property.type)
      .filter((type) => _.isPlainObject(type))
      .filter((type) => type.name !== name)
      .map(function(type) {
        return this.factory.create(type);
      }.bind(this))
      .value();
  }

  async resolve(resolver) {
    if (this._isResolved) {
      return;
    }

    this._isResolved = true;

    for (const dependency of this._dependencies) {
      await dependency.resolve(resolver);
    }

    await resolver(this.type);
  }

}

class DatabaseTypeFactory {

  constructor() {
    this.types = {};
  }

  create(type) {
    if (_.isUndefined(this.types[type.name])) {
      this.types[type.name] = new DatabaseType(type, this);
    }

    return this.types[type.name];
  }

}

module.exports = class DatabaseAdapter {

  async generateDatabaseSchema({ types }) {
    const factory = new DatabaseTypeFactory();
    const databaseTypes = _.map(types, (type) => factory.create(type));

    for (const type of databaseTypes) {
      await type.resolve(this._createTable.bind(this));
    }
  }

  async _createTable() {}

  async list() {
    return [];
  }

  async get() {
    return {};
  }

  async remove() {
    return [];
  }

  async insert() {
    return [];
  }

  async update() {
    return [];
  }

};
