//v1.3 withings custom
/*
options:
write //set common write variable to true
forceIndex //instead of trying to find names for array entries, use the index as the name
channelName //set name of the root channel
preferedArrayName //set key to use this as an array entry name
autoCast (true false) // make JSON.parse to parse numbers correctly
descriptions: Object of names for state keys
*/
const JSONbig = require("json-bigint")({ storeAsString: true });
module.exports = class Json2iob {
  constructor(adapter) {
    this.adapter = adapter;
    this.alreadyCreatedObjects = {};
  }

  async parse(path, element, options) {
    try {
      if (element === null || element === undefined) {
        this.adapter.log.debug("Cannot extract empty: " + path);
        return;
      }

      const objectKeys = Object.keys(element);

      if (!options || !options.write) {
        if (!options) {
          options = { write: false };
        } else {
          options["write"] = false;
        }
      }

      if (typeof element === "string" || typeof element === "number") {
        let name = element;
        if (typeof element === "number") {
          name = element.toString();
        }
        if (!this.alreadyCreatedObjects[path]) {
          await this.adapter
            .setObjectNotExistsAsync(path, {
              type: "state",
              common: {
                name: name,
                role: this.getRole(element, options.write),
                type: element !== null ? typeof element : "mixed",
                write: options.write,
                read: true,
              },
              native: {},
            })
            .then(() => {
              this.alreadyCreatedObjects[path] = true;
            })
            .catch((error) => {
              this.adapter.log.error(error);
            });
        }

        this.adapter.setState(path, element, true);

        return;
      }
      if (!this.alreadyCreatedObjects[path]) {
        let name = options.channelName || "";
        const lastPath = path.split(".").pop();
        if (options.descriptions && options.descriptions[lastPath]) {
          name = options.descriptions[lastPath];
        }
        await this.adapter
          .setObjectNotExistsAsync(path, {
            type: "channel",
            common: {
              name: name,
              type: "mixed",
              write: false,
              read: true,
            },
            native: {},
          })
          .then(() => {
            this.alreadyCreatedObjects[path] = true;
            options.channelName = undefined;
          })
          .catch((error) => {
            this.adapter.log.error(error);
          });
      }
      if (Array.isArray(element)) {
        this.extractArray(element, "", path, options);
        return;
      }
      objectKeys.forEach(async (key) => {
        if (this.isJsonString(element[key]) && options.autoCast) {
          element[key] = JSONbig.parse(element[key]);
        }
        //custom
        if (key === "hr" || key === "rr" || key === "snoring") {
          if (typeof element[key] === "object") {
            //eslint-disable-next-line no-unused-vars
            element[key] = Object.entries(element[key]).map(([key, value]) => value);
          }
        }
        if (Array.isArray(element[key])) {
          this.extractArray(element, key, path, options);
        } else if (element[key] !== null && typeof element[key] === "object") {
          this.parse(path + "." + key, element[key], options);
        } else {
          if (!this.alreadyCreatedObjects[path + "." + key]) {
            let objectName = key;
            if (options.descriptions && options.descriptions[key]) {
              objectName = options.descriptions[key];
            }
            const type = element[key] !== null ? typeof element[key] : "mixed";
            const common = {
              name: objectName,
              role: this.getRole(element[key], options.write),
              type: type,
              write: options.write,
              read: true,
            };
            //custom
            if (
              key !== "total_sleep_time" &&
              (key.endsWith("time") || key.endsWith("date") || key.endsWith("time") || key.endsWith("created"))
            ) {
              if (element[key] > 1545772) {
                common.role = "date";
                common.type = "mixed";
              } else {
                common.role = "time";
                common.type = "mixed";
              }
            }

            await this.adapter
              .setObjectNotExistsAsync(path + "." + key, {
                type: "state",
                common: common,
                native: {},
              })
              .then(() => {
                this.alreadyCreatedObjects[path + "." + key] = true;
              })
              .catch((error) => {
                this.adapter.log.error(error);
              });
          }
          //custom
          if (
            key !== "total_sleep_time" &&
            (key.endsWith("time") || key.endsWith("date") || key.endsWith("time") || key.endsWith("created"))
          ) {
            if (!isNaN(Number(element[key])) && element[key] > 1545772) {
              element[key] = element[key] * 1000;
            } else if (!isNaN(Number(element[key]))) {
              element[key] = new Date(element[key] * 1000).toLocaleTimeString();
            }
          }
          this.adapter.setState(path + "." + key, element[key], true);
        }
      });
    } catch (error) {
      this.adapter.log.error("Error extract keys: " + path + " " + JSON.stringify(element));
      this.adapter.log.error(error);
    }
  }
  extractArray(element, key, path, options) {
    try {
      if (key) {
        element = element[key];
      }
      element.forEach(async (arrayElement, index) => {
        index = index + 1;
        if (index < 10) {
          index = "0" + index;
        }
        let arrayPath = key + index;
        if (typeof arrayElement === "string") {
          this.parse(path + "." + key + "." + arrayElement, arrayElement, options);
          return;
        }
        if (typeof arrayElement[Object.keys(arrayElement)[0]] === "string") {
          arrayPath = arrayElement[Object.keys(arrayElement)[0]];
        }
        Object.keys(arrayElement).forEach((keyName) => {
          if (keyName.endsWith("Id") && arrayElement[keyName] !== null) {
            if (arrayElement[keyName] && arrayElement[keyName].replace) {
              arrayPath = arrayElement[keyName].replace(/\./g, "");
            } else {
              arrayPath = arrayElement[keyName];
            }
          }
        });
        Object.keys(arrayElement).forEach((keyName) => {
          if (keyName.endsWith("Name")) {
            if (arrayElement[keyName] && arrayElement[keyName].replace) {
              arrayPath = arrayElement[keyName].replace(/\./g, "");
            } else {
              arrayPath = arrayElement[keyName];
            }
          }
        });

        if (arrayElement.id) {
          if (arrayElement.id.replace) {
            arrayPath = arrayElement.id.replace(/\./g, "");
          } else {
            arrayPath = arrayElement.id;
          }
        }
        if (arrayElement.name) {
          arrayPath = arrayElement.name.replace(/\./g, "");
        }
        if (arrayElement.label) {
          arrayPath = arrayElement.label.replace(/\./g, "");
        }
        if (arrayElement.labelText) {
          arrayPath = arrayElement.labelText.replace(/\./g, "");
        }
        if (arrayElement.start_date_time) {
          arrayPath = arrayElement.start_date_time.replace(/\./g, "");
        }
        if (options.preferedArrayName && options.preferedArrayName.indexOf("+") !== -1) {
          const preferedArrayNameArray = options.preferedArrayName.split("+");
          if (arrayElement[preferedArrayNameArray[0]]) {
            //eslint-disable-next-line no-useless-escape
            const element0 = arrayElement[preferedArrayNameArray[0]].replace(/\./g, "").replace(/\ /g, "");
            let element1 = "";
            if (preferedArrayNameArray[1].indexOf("/") !== -1) {
              const subArray = preferedArrayNameArray[1].split("/");
              const subElement = arrayElement[subArray[0]];
              if (subElement && subElement[subArray[1]] !== undefined) {
                element1 = subElement[subArray[1]];
              } else if (arrayElement[subArray[1]] !== undefined) {
                element1 = arrayElement[subArray[1]];
              }
            } else {
              //eslint-disable-next-line no-useless-escape
              element1 = arrayElement[preferedArrayNameArray[1]].replace(/\./g, "").replace(/\ /g, "");
            }
            arrayPath = element0 + "-" + element1;
          }
        } else if (options.preferedArrayName && options.preferedArrayName.indexOf("/") !== -1) {
          const preferedArrayNameArray = options.preferedArrayName.split("/");
          const subElement = arrayElement[preferedArrayNameArray[0]];
          if (subElement) {
            //eslint-disable-next-line no-useless-escape
            arrayPath = subElement[preferedArrayNameArray[1]].replace(/\./g, "").replace(/\ /g, "");
          }
        } else if (options.preferedArrayName && arrayElement[options.preferedArrayName]) {
          if ((arrayPath = arrayElement[options.preferedArrayName].replace)) {
            arrayPath = arrayElement[options.preferedArrayName].replace(/\./g, "");
          } else {
            arrayPath = arrayElement[options.preferedArrayName];
          }
        }

        if (options.forceIndex) {
          arrayPath = key + index;
        }
        //special case array with 2 string objects
        if (
          !options.forceIndex &&
          Object.keys(arrayElement).length === 2 &&
          typeof Object.keys(arrayElement)[0] === "string" &&
          typeof Object.keys(arrayElement)[1] === "string" &&
          typeof arrayElement[Object.keys(arrayElement)[0]] !== "object" &&
          typeof arrayElement[Object.keys(arrayElement)[1]] !== "object" &&
          arrayElement[Object.keys(arrayElement)[0]] !== "null"
        ) {
          let subKey = arrayElement[Object.keys(arrayElement)[0]];
          const subValue = arrayElement[Object.keys(arrayElement)[1]];
          const subName = Object.keys(arrayElement)[0] + " " + Object.keys(arrayElement)[1];
          if (key) {
            subKey = key + "." + subKey;
          }
          if (!this.alreadyCreatedObjects[path + "." + subKey]) {
            await this.adapter
              .setObjectNotExistsAsync(path + "." + subKey, {
                type: "state",
                common: {
                  name: subName,
                  role: this.getRole(subValue, options.write),
                  type: subValue !== null ? typeof subValue : "mixed",
                  write: options.write,
                  read: true,
                },
                native: {},
              })
              .then(() => {
                this.alreadyCreatedObjects[path + "." + subKey] = true;
              });
          }
          this.adapter.setState(path + "." + subKey, subValue, true);
          return;
        }
        this.parse(path + "." + arrayPath, arrayElement, options);
      });
    } catch (error) {
      this.adapter.log.error("Cannot extract array " + path);
      this.adapter.log.error(error);
    }
  }
  isJsonString(str) {
    try {
      JSON.parse(str);
      //eslint-disable-next-line no-unused-vars
    } catch (e) {
      return false;
    }
    return true;
  }
  getRole(element, write) {
    if (typeof element === "boolean" && !write) {
      return "indicator";
    }
    if (typeof element === "boolean" && write) {
      return "switch";
    }
    if (typeof element === "number" && !write) {
      return "value";
    }
    if (typeof element === "number" && write) {
      return "level";
    }
    if (typeof element === "string") {
      return "text";
    }
    return "state";
  }
};
