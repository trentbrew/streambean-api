import PocketBase from 'pocketbase'
const pocketbase = new PocketBase('https://streambean.pockethost.io')

export default {
  api: pocketbase,
  get: async (collection, params = {}, batchSize = 200) => {
    let record = pocketbase.collection(collection)
    if (params) {
      if (params.id) {
        return record
          .getOne(params.id, { $autoCancel: false })
          .then((data) => {
            return data
          })
          .catch((err) => {
            console.error(err)
          })
      } else {
        return record.getList(1, batchSize, {
          ...params,
          $autoCancel: false,
        })
      }
    } else {
      return record
        .getFullList({
          $autoCancel: false,
        })
        .then((data) => {
          return data
        })
        .catch((err) => {
          console.error(err)
        })
    }
  },

  create: async (collection, data, params = {}) => {
    const formData = new FormData()
    Object.entries(data).forEach(([key, value]) => {
      if (typeof value === 'string' || value instanceof Blob) {
        formData.append(key, value)
      }
    })
    return await pocketbase.collection(collection).create(formData, {
      ...params,
      $autoCancel: false,
    })
  },

  update: async (collection, id, data, params = {}) => {
    return await pocketbase.collection(collection).update(id, data, {
      ...params,
      $autoCancel: false,
    })
  },

  deleteRecord: async (collection, id) => {
    return await pocketbase.collection(collection).delete(id)
  },

  subscribe: async (collection, id = '*', callback) => {
    return await pocketbase.collection(collection).subscribe(id, callback)
  },

  unsubscribe: async (collection, id) => {
    return await pocketbase.collection(collection).unsubscribe(id)
  },

  signUp: async (email, password) => {
    return await pocketbase.collection('users').create({
      email,
      password,
      passwordConfirm: password,
    })
  },

  signIn: async (email, password) => {
    return await pocketbase.collection('users').authWithPassword(email, password)
  },
}
