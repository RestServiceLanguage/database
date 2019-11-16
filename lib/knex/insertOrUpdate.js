const _ = require('lodash');

function removeUnneededDataAttributes(type, data) {
  const properties = _.map(type.properties, (property) => property.name);
  return _.pick(data, properties);
}

function removeArrayDataAttributes(type, data) {
  const properties = _(type.properties)
    .filter((property) => !_.isArray(property.type))
    .map((property) => property.name)
    .value();

  return _.pick(data, properties);
}

function removeNonArrayDataAttributes(type, data) {
  const properties = _(type.properties)
    .filter((property) => _.isArray(property.type))
    .map((property) => property.name)
    .value();

  return _.pick(data, properties);
}

async function insertArrayData({ type, arrayKey, arrayData, id, db }) {
  const mappedArrayData = _.map(arrayData, (data) => ({
    [type.name]: id,
    value: data
  }));

  if (mappedArrayData.length > 0) {
    await db(`${type.name}_${arrayKey}`).insert(mappedArrayData);
  }
}

module.exports = async function ({ type, id, data, db }) {
  const databaseData = removeUnneededDataAttributes(type, data);

  const withoutArraysData = removeArrayDataAttributes(type, databaseData);
  const arraysData = removeNonArrayDataAttributes(type, databaseData);

  if (_.isUndefined(id)) {
    const result = await db(type.name).insert(withoutArraysData).returning('id');
    id = result[0];
  } else {
    await db(type.name).update(withoutArraysData).where('id', id);
  }

  const arrayKeys = _.keys(arraysData);
  for (const arrayKey of arrayKeys) {
    await db(`${type.name}_${arrayKey}`).where(type.name, id).del();

    await insertArrayData({
      type,
      arrayKey,
      arrayData: arraysData[arrayKey],
      id
    });
  }

  return [id];
};
