const _ = require('lodash');

const typeMapping = {
  'Integer': 'integer',
  'String': 'string',
  'Text': 'text',
  'Date': 'date',
  'Float': 'float',
  'Boolean': 'boolean'
};

const filterRegex = /^([^<>=]+)(<|>|=|<=|>=)([^<>=]+)$/m;
function getFilterParameters(filter) {
  if (filterRegex.test(filter)) {
    const match = filter.match(filterRegex);
    return {
      name: match[1],
      operation: match[2],
      value: match[3]
    };
  }
}

class ListQueryBuilder {
  constructor({ type, database }) {
    this.type = type;
    this.database = database;
    this._expands = [];
    this._filters = [];
    this._limit = 100;
    this._offset = 0;
    this._transformFunctions = [];
  }

  filter(filters) {
    filters = _.map(filters, (filter) => getFilterParameters(filter));
    this._filters = _.concat(this._filters, filters);
    return this;
  }

  expand(expands) {
    this._expands = _.concat(this._expands, expands);
    return this;
  }

  limit(limit) {
    this._limit = limit;
    return this;
  }

  offset(offset) {
    this._offset = offset;
    return this;
  }

  get arrayFilters() {
    return _.filter(this._filters, this._isArrayFilter);
  }

  get directFilters() {
    return _.filter(this._filters, (filter) => !this._isArrayFilter(filter));
  }

  _isFilter(filter) {
    const property = _.find(
      this.type.properties,
      (property) => property.name === filter.name
    );

    return !_.isUndefined(property);
  }

  _isArrayFilter(filter) {
    const property = _.find(
      this.type.properties,
      (property) => property.name === filter.name
    );

    return !_.isUndefined(property) && _.isArray(property.type);
  }

  build() {
    const builderContext = this;
    const query = this.database
      .select(
        `${this.type.name}.id`,
        ..._.map(
          this.nonArrayFields,
          (field) => `${this.type.name}.${field.name}`
        )
      )
      .from(function() {
        builderContext._buildBaseDataQuery.bind(builderContext)(this);
      });

    const queryWithArray = this._buildArrayQuery(query);
    const queryWithExpand = this._buildExpandQuery(queryWithArray);

    return queryWithExpand;
  }

  _buildBaseDataQuery(queryContext) {
    queryContext
      .select()
      .from(this.type.name)
      .as(this.type.name);

    for (let filter of this.directFilters) {
      queryContext.where(filter.name, filter.operation, filter.value);
    }

    queryContext.limit(this._limit).offset(this._offset);
  }

  _buildArrayQuery(query) {
    for (const field of this.arrayFields) {
      query = query
        .select(`${this.type.name}_${field.name}.value as ${field.name}`)
        .leftOuterJoin(
          `${this.type.name}_${field.name}`,
          `${this.type.name}_${field.name}.${this.type.name}`,
          `${this.type.name}.id`
        );
    }

    return query;
  }

  get arrayFields() {
    return _.filter(this.type.properties, (property) => _.isArray(property.type));
  }

  get nonArrayFields() {
    return _.filter(
      this.type.properties,
      (property) => !_.isArray(property.type)
    );
  }

  _buildExpandQuery(query) {
    const typeName = this.type.name;

    return _.reduce(
      this._expands,
      (acc, expand) => {
        const type = _.isArray(expand.type) ? expand.type[0] : expand.type;
        const fields = ['id', ..._.map(type.properties, (p) => p.name)];

        const subtableName = `${type.name}_${expand.name}`;

        for (const field of fields) {
          acc = acc.select(`${subtableName}.${field} as ${expand.name}_${field}`);
        }

        if (_.isArray(expand.type)) {
          acc.leftOuterJoin(
            `${type.name} as ${subtableName}`,
            `${subtableName}.id`,
            `${typeName}_${expand.name}.value`
          );
        } else {
          acc.leftOuterJoin(
            `${type.name} as ${subtableName}`,
            `${typeName}.${expand.name}`,
            `${subtableName}.id`
          );
        }

        return acc;
      },
      query
    );
  }

  transformData(data) {
    const groupedData = _.groupBy(data, 'id');

    const expandedData = _.reduce(
      this._expands,
      (acc, expand) => {
        const type = _.isArray(expand.type) ? expand.type[0] : expand.type;
        const fields = ['id', ..._.map(type.properties, (p) => p.name)];
        const fullFieldNames = _.map(
          fields,
          (field) => `${expand.name}_${field}`
        );

        return _(acc)
          .mapValues((dataset) => {
            const mappedData = _.map(dataset, (datum) => {
              if (_.isNil(datum[expand.name])) {
                return _.omit(datum, ...fullFieldNames);
              } else {
                return {
                  ..._.omit(datum, fullFieldNames),
                  [expand.name]: _.reduce(
                    fields,
                    (acc, field, index) => ({
                      ...acc,
                      [field]: datum[fullFieldNames[index]]
                    }),
                    {}
                  )
                };
              }
            });

            return mappedData;
          })
          .value();
      },
      groupedData
    );

    const datasets = _.values(expandedData);
    const type = this.type;
    const mergedData = _.map(datasets, (dataset) =>
      _.mergeWith({}, ...dataset, (output, input, field) => {
        const property = _.find(
          type.properties,
          (property) => property.name === field
        );

        if (_.isArray(_.get(property, 'type'))) {
          const dataArray = _.isNil(output) ? [input] : [...output, input];

          if (_.isUndefined(typeMapping[property.type])) {
            return dataArray;
          } else {
            return _(dataArray).filter((el) => !_.isNil(el)).uniqBy('id').value();
          }
        }
        return input;
      })
    );

    return mergedData;
  }
}

module.exports = async function list({
  type,
  database,
  filters,
  expands,
  limit,
  offset
}) {
  const queryBuilder = new ListQueryBuilder({ type, database });

  const query = queryBuilder
    .filter(filters)
    .expand(expands)
    .limit(limit)
    .offset(offset)
    .build();

  const data = await query;

  return queryBuilder.transformData(data);
};
