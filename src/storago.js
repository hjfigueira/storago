"use strict";
var storago = {};
module.exports = storago;;
(function(storago) {

  //static property
  storago.debug = false;

  //local property
  var tables = [];
  var __tables2 = [];
  var __tables = tables;
  var __migrations = {};
  var __migrations_number = [0];

  //local function
  var Metadata = function() {
    this.dependents = {};
    this.parents = {};
    this.indexs = [];
  };

  //class Entry
  var Entry = function(name, prop){};
  storago.Entry = Entry;
  Entry.prototype.rowid = null;
  var __Entry = Entry;

  Entry.prototype.pre_save = function(cb, cbErr, tx) {
    return cb();
  };

  Entry.prototype.post_save = function(cb, cbErr, tx) {
    return cb();
  };

  Entry.prototype.save = function(cb, cbErr, tx){

    var self = this;

    self.pre_save.call(self, function(){

      self._save.call(self, function(row, tx){

        self.post_save.call(self, function(){

          cb(row, tx);

        }, cbErr, tx);

      }, cbErr, tx);

    }, cbErr, tx);
  };

  Entry.prototype._insert = function(tx, cb, errCb){

    var self = this;

    var insert = new query.Insert(this._TABLE);
    insert.add(this);
  
    insert.execute(tx, function(tx, result){
      self.rowid = result.insertId;
      if(cb) cb(self, tx);

    }, function(tx, err){
      if(!!errCb){
        errCb(err);
      }else{
        var msg = "(storago) " + err.message;
        throw msg;
      }
    });
  };

  Entry.prototype._update = function(tx, cb, errCb){

    var self = this;
  
    var ondata = function(row){

      var data = row._DATA;
      var update = new query.Update(self._TABLE);

      for (var p in data) {
        var type   = self._TABLE.META.props[p];
        var self_p = tools.fieldToDb(type, self[p]);
        if (self_p != data[p]) {
          update.set(p, self[p]);
        }
      }
      update.where('rowid = ?', row.rowid);

      update.execute(tx, function(tx){

        cb(self, tx);

      }, function(tx, err){

         if(!!errCb){
          errCb(err);

        } else {

          var msg = "(storago) " + err.message;
          throw msg;
        }
      });
    };

    if(!this._DATA){
      this._TABLE.find(this.rowid, ondata, errCb, tx);
    } else {
      ondata(this);
    }
  }

  Entry.prototype._save = function(cb, cbErr, tx) {

    var self = this;

    if(!!tx){

      if(!this.rowid){

        this._insert(tx, cb, cbErr);
      }else{
      
        this._update(tx, cb, cbErr);
      }
      return;

    }else{

      storago.db.transaction(function(tx){

        if(!self.rowid){

          self._insert.call(self, tx, cb, cbErr);
        }else{
          
          self._update.call(self, tx, cb, cbErr);
        }

      }, cbErr);
    }
  };

  Entry.prototype.put = function(data) {
    for (var d in data) {
      this[d] = data[d];
    };
  };

  Entry.prototype.array = function(){
  
    return this._DATA;
  }

  Entry.prototype.delete = function(cb, errCb) {

    if(!this.rowid) return cb();

    var del = new query.Delete(this._TABLE);
    del.where(this._TABLE.name + '.rowid = ?', this.rowid);

    storago.db.transaction(function(tx) {
      del.execute(tx, cb, function(tx, err) {
        if (errCb != undefined) return errCb(err);
        var msg = "(storago) " + err.message;
        throw msg;
      });
    }, errCb);
  }

  Entry.prototype.refresh = function(cb) {
    var self = this;
    this._TABLE.find(this.rowid, function(row) {
      for (var p in row) self[p] = row[p];
      if (cb) cb();
    });
  };

  Entry.hasColumn = function(column, cb, cbErr) {

    var self = this;
    storago.db.transaction(function(tx) {
      var info = new query.InfoWEB(self);
      info.execute(tx, function(row) {
        cb(row.hasOwnProperty(column));
      }, cbErr);

    }, errCb);
  };

  Entry.info = function(cb, cbErr) {
    var self = this;
    storago.db.transaction(function(tx) {
      var info = new query.Info(self);
      info.execute(tx, cb, cbErr);
    }, errCb);
  };

  Entry.findMemory = function(id, cb, cbErr){

    var self = this;

    if(!this._memory){
      this._memory = {};
    }

    if(!this._memory.hasOwnProperty(id)){
      this._memory[id] = [];
    }

    this._memory[id].push([cb, cbErr]);
    if(this._memory[id].length > 1) return;

    this.find(id, function(row){
    
      var func = null;
      while(func = self._memory[id].pop()){
      
        func[0](row);
      }

    }, function(e){

      var func = null;
      while(func = self._memory[id].pop()){

        var cbErr = func[1];
        if(typeof cbErr == 'function') cbErr(e);
      }
    });
  };

  Entry.find = function(rowid, cb, cbErr, tx) {

    if(!rowid) return cb(null);
    this.findBy('rowid', rowid, cb, cbErr, tx);
  };

  Entry.findBy = function(col, value, cb, cbErr, tx) {
    var self = this;
    var select = this.select();
    select.where(this.META.name + '.' + col + ' = ?', value);
    select.one(cb, cbErr, tx);
  };

  Entry.select = function() {
    var select = new query.Select(this);
    return select;
  };

  Entry.index = function(index) {
    this.META.indexs.push(index);
  };

  Entry.hasMany = function(many_name, child_entry, name) {
    this.META.dependents[many_name] = child_entry;
    child_entry.META.parents[name] = this;
    var self = this;
    var ref_column = name + '_id';

    //config child
    child_entry.prototype[name] = function(item, cbErr) {

      if (typeof(item) == 'function') { // get mode

        var ref_col = this[ref_column];
        if (!ref_col) return item(null);

        self.findMemory(ref_col, item, cbErr);
        return;

      } else if (!item) {

        this[ref_column] = null;
        return;

      } else if (typeof(item) == 'object') { // set mode

        if (item._TABLE && item._TABLE.META.name == self.META.name) {
          this[ref_column] = item.rowid;
          return;
        } else {
          var msg = "(storago) No permission: object must be class of (" + self.META.name + ")";
          msg += ", but is the class (" + item._TABLE.META.name + ")";
          throw msg;
        }
      }
    };

    //config parent
    Object.defineProperty(this.prototype, many_name, {
      get: function() {
        var select = child_entry.select();
        select.where(ref_column + ' = ?', this.rowid);
        return select;
      }
    });
  };

  //static function connect
  storago.connect = function(name, description, size) {
    storago.db = openDatabase(name, '', description, size);
  };

  //static function define
  storago.define = function(name, props) {

    var __meta = new Metadata();
    __meta.name = name;
    __meta.props = props;

    var row;
    eval("row = function " + name + "(){};");
    for (var i in __Entry) row[i] = __Entry[i]; //clone Entry

    row.META = __meta;
    row.prototype = new __Entry();
    row.prototype._TABLE = row;
    __tables.push(row);
    __tables2.push(row);

    return row;
  };

  storago.migration = function(number, migreFunc, migreErr) {
    if (__migrations_number.indexOf(number) >= 0) {
      throw "(storago) Migration " + number + " already exists";
    }
    __migrations_number.push(number);
    __migrations_number.sort(function(a, b){ return a - b });
    __migrations[number] = [migreFunc, migreErr];
  }

  //static function schema
  storago.schema = function(cb, errCb) {

    var ts = [];
    var self = this;

    var t_create = [];
    var t_index  = [];
    for(var i in __tables){
      t_create[i] = __tables[i]; //clone
      t_index[i]  = __tables[i]; //clone
    }

    var _create = function(tx, onCb){

      var table = t_create.pop();

      if(!!table){
        var create = new query.Create(table);
        create.execute(tx, function(tx) {
          _create(tx, onCb);
        }, errCb);

      }else{

        return onCb();
      }
    }

    var _index = function(tx, onCb){

      var table = t_index.pop();
      if (table) {
        var index = new query.Index(table);
        index.execute(tx, function(tx) {
          _index(tx, onCb);
        }, errCb);

      } else {
        return onCb();
      }
    }

    var onindex = function(onCb, errCb){
    
      storago.db.transaction(function(tx){
        _index(tx, onCb);
      }, errCb);
    }

    var oncreate = function(onCb){

      storago.db.transaction(function(tx){
        _create(tx, onCb);
      }, errCb);
    }

    var migreTo = function(version, onCb) {

      if(version && __migrations[version]){

        console.log(storago.db.version, version);
        storago.db.changeVersion(storago.db.version, String(version), function(t){

          __migrations[version][0](t);
        }, function(err) {

          if (!!__migrations[version][1]){
          
            __migrations[version][1](err);
            return;

          }else{
          
            errCb(err);
            return;
          }
          
        }, function() {

          migreTo(__migrations_number.pop(), function(){
            onindex(onCb);
          });
        });

      } else {
        __migrations = {}; //clear migrations
        onindex(onCb);
      }
    }

    var version = parseInt(storago.db.version) || '';
    if (version === '') {
      var db_version = __migrations_number[__migrations_number.length - 1];
      if (db_version == 0){
        
        return oncreate(function(){
          onindex(cb);
        });
      }

      storago.db.changeVersion('', db_version, function(){ oncreate(function(){ onindex(cb) }); });

    } else {

      return oncreate(function(){

        var index = __migrations_number.indexOf(version);
        if (index < 0) throw "(storago) Version " + version + " no have on migration list";
        __migrations_number = __migrations_number.slice(index).reverse();
        __migrations_number.pop(); //Discart current version
        migreTo(__migrations_number.pop(), cb);
      });
    }
  };

  //static function reset
  storago.reset = function(cb) {

    var changeVersion = function(){
      
      storago.db.changeVersion(storago.db.version, '', cb);
    }

    var ondrop = function(tx){
      var table = tables.pop();
      if(table == undefined){
        changeVersion();
        return;
      }
      var drop = new query.Drop(table);
      drop.execute(tx, ondrop);
    }

    storago.db.transaction(function(tx){ ondrop(tx); });
  };

  //free sql
  var sql = function(sql, data, cb, errCb){
  
    storago.db.transaction(function(tx){
      
      tx.executeSql(sql, data, cb, errCb);
    }, errCb);
  };
  storago.sql = sql;

  //package query
  var query = {};
  storago.query = query;

  //class query.Select
  var select = function(table) {
    this.table = table;
    this._offset = null;
    this._limit = null;
    this._from = null;
    this._distinct = false;
    this._wheres = [];
    this._joins = [];
    this._left_joins = [];
    this._columns = [];
    this._values = [];
    this._orders = [];
    this._groups = [];
    this._havings = [];
  }
  query.Select = select;

  select.prototype.limit = function(limit, offset) {
    this._limit = limit;
    if (offset) this._offset = offset;
    return this;
  };

  select.prototype.distinct = function(){
    this._distinct = true;
  };

  select.prototype.order = function(col) {
    if (col.search('ASC') < 0 && col.search('asc') < 0 &&
      col.search('DESC') < 0 && col.search('desc' < 0)) {
      col += ' ASC';
    }
    this._orders.push(col);
    return this;
  };

  select.prototype.where = function(where, data) {
    if (!Array.isArray(data) && data != undefined) data = [data];
    this._wheres.push([where, data]);
    return this;
  };

  select.prototype.from = function(from, columns) {
    this._from = from;
    if (columns == undefined) columns = ['*'];
    this._columns.push(from + '.rowid');
    for (var c in columns) this._columns.push(from + '.' + columns[c]);
    return this;
  };

  select.prototype.join = function(name, on, columns) {

    if (columns == undefined) columns = [name + '*'];
    this._joins.push([name, on]);
    this._columns = this._columns.concat(columns);
  };

  select.prototype.join_left = function(name, on, columns) {

    if (columns == undefined) columns = [name + '*'];
    this._left_joins.push([name, on]);
    this._columns = this._columns.concat(columns);
  };

  select.prototype.render = function() {

    this._values = [];
    if (this._from == null && this.table) this.from(this.table.META.name);

    var sql = 'SELECT';

    if(this._distinct) sql += ' DISTINCT';

    for (var c in this._columns) {

      if (c == 0) {
        sql += ' ';
      } else {
        sql += ', ';
      }
      sql += this._columns[c];
    }

    if (this._from != null) sql += ' FROM ' + this._from;

    if (this._joins.length) {
      var size = this._joins.length;
      for (var j in this._joins) {
        var join = this._joins[j];
        sql += ' join ' + join[0] + ' on ' + join[1];
      }
    }

    if (this._left_joins.length) {
      var size = this._left_joins.length;
      for (var j in this._left_joins) {
        var join = this._left_joins[j];
        sql += ' left join ' + join[0] + ' on ' + join[1];
      }
    }

    if (this._wheres.length) {
      sql += ' WHERE ';
      for (var w in this._wheres) {
        var where = this._wheres[w];
        sql += where[0];
        if ((this._wheres.length - 1) != w) sql += ' AND ';
        var value = where[1];
        if (value != undefined) this._values = this._values.concat(value);
      }
    }

    if (this._orders.length) {
      sql += ' ORDER BY ';
      for (var o in this._orders) {
        sql += this._orders[o];
        if ((this._orders.length - 1) != o) sql += ', ';
      }
    }

    if (this._limit != null) sql += ' LIMIT ' + this._limit;
    if (this._offset != null) sql += ' OFFSET ' + this._offset;
    sql += ';';

    return sql;
  };

  select.prototype.toString = function(){
    return this.render();
  };

  select.prototype.execute = function(tx, cb, cbErr){

    try{

      var self = this;
      var sql  = this.render();
      if (storago.debug) console.log(sql, this._values);
      tx.executeSql(sql, this._values, cb, function(tx, err){
        err.name   = self.table.META.name;
        err.table  = self.table.META.name;
        err.action = 'select';
        if(!!cbErr) cbErr(tx, err);
      });

    }catch(e){

      if(typeof sql != 'undefined') e.sql = sql;
    
      if(!!cbErr){
        
        cbErr(null, e);
      }else{
        
        throw e;
      }
    }
  };

  select.prototype.all = function(cb, cbErr, tx) {

    var rowset = [];
    var self = this;

    var ontx = function(tx){

      self.execute(tx, function(tx, result){
        var rows = result.rows;
        for (var r = 0; r < rows.length; r++){
          
          try{
            var row = rows.item(r);
            var table = self.table;
            var entry = new table();
            var props = self.table.META.props
            for (var p in row) {
              entry[p] = tools.dbToField(props[p], row[p]);
            }
            entry._DATA = row;
            rowset.push(entry);
         
          }catch(e){
          
            if(!!cbErr){
              
              cbErr(null, e);
            }else{
              
              throw e;
            }
          }
        }

        if (storago.debug) console.log(rowset);
        if (typeof(cb) != 'function'){
        
          var error = "(storago) is not a function, " + typeof(cb) + " given";
          if(!!cbErr){
            cbErr(error);
          }else{
            throw error;
          }
          return;
        }
        
        if (cb) cb(rowset);
        return;

      }, function(tx, err) {
        if (cbErr) {
          cbErr(err);
          return;
        } else {
          throw "(storago) " + err.message;
        }
      });
    };

    if(!!tx){
      ontx(tx);

    }else{
      
      storago.db.transaction(ontx, cbErr);
    }
  };

  select.prototype.one = function(cb, cbErr, tx) {

    this.limit(1);
    this.all(function(rowset){
      if (rowset.length == 0) {
        cb(null);
        return;
      };
      if (cb == undefined) throw "(storago) callback undefined";
      if (typeof(cb) != 'function') throw "(storago) is not a function, " + typeof(cb) + " given";
      cb(rowset[0]);
    }, cbErr, tx);
  };

  // Private package tools
  var tools = {};
  tools.fieldToDb = function(type, value) {
    
    if(value == undefined) return null;
    if(type === undefined) return value;
    
    type = type.toLowerCase().trim();

    if(type == 'date' || type == 'datetime'){

      if(typeof value == 'string')  value = new Date(value.replace(/-/g, '/'));
      if(type == 'date')     return value.getIsoDate();
      if(type == 'datetime') return value.getIso();
    }

    if(typeof(value) == 'function') throw '(storago) function has been setted like property: ' + value;
    return value;
  };

  tools.dbToField = function(type, value) {

    if(value && (type == 'DATE' || type == 'DATETIME')) return new Date(value.replace(/-/g, '/'));
    if(value && (type == 'BOOL')){
      if(value == 'false') return false;
      if(value == 'true')  return true;
    };

    return value;
  };

  //class query.Index
  var index = function(table) {

    this.table = table;
    this.indexs = [];
  };
  query.Index = index;

  index.prototype.render = function() {

    var indexs = this.table.META.indexs;
    for (var i in indexs) {
      var index = indexs[i];
      var sql = "CREATE INDEX IF NOT EXISTS ";
      sql += this.table.META.name + "_" + index + "_idx ON ";
      sql += this.table.META.name + " (" + index + ");";
      this.indexs.push(sql);
    }
  };

  index.prototype.execute = function(tx, cb, cbErr) {

    try{

      var self = this;
      this.render();

      if (this.indexs.length == 0) {
        cb(tx);
        return;
      }

      var onindex = function(i) {
        if (self.indexs.length == i) {
          cb(tx);
          return;
        };
        var index = self.indexs[i];
        if (storago.debug) console.log(index);
        tx.executeSql(index, null, function() {
          onindex(i + 1);
        }, function(tx, err){
          err.name  = self.table.META.name;
          err.action = 'create index';
          if(!!cbErr) cbErr(tx, err);
        });
      };

      onindex(0);

    }catch(e){
    
      if(!!cbErr){
        
        cbErr(null, e);
      }else{
        
        throw e;
      }
    }
  };

  //class query.Create
  var create = function(table) {

    this.table = table;
    this.columns = [];
    this.indexs = [];
  };
  query.Create = create;

  create.prototype.parse = function() {

    for (var name in this.table.META.props) {
      var type = this.table.META.props[name];
      this.columns.push('"' + name + '" ' + type.toUpperCase());
    }

    for (var name in this.table.META.parents) {
      this.columns.push('"' + name + '_id" NUMERIC');
    }
  };

  create.prototype.render = function() {

    this.parse();
    var sql = 'CREATE TABLE IF NOT EXISTS ' + this.table.META.name + '(';
    for (var c in this.columns) {
      sql += this.columns[c];
      if ((this.columns.length - 1) != c) sql += ', ';
    }
    sql += '); '

    return sql;
  };

  create.prototype.execute = function(tx, cb, cbErr) {
 
    try{

      var self = this;
      var sql  = this.render();
      if (storago.debug) console.log(sql);
      tx.executeSql(sql, [], cb, function(tx, err){
        err.name  = self.table.META.name;
        err.action = 'create table';
        if(!!cbErr) cbErr(tx, err);
      });

    }catch(e){
    
      if(!!cbErr){
        
        cbErr(null, e);
      }else{
        
        throw e;
      }
    }
  };

  //class query.Info
  var info = function(table) {
    this.table = table;
  };
  query.Info = info;

  info.prototype.execute = function(tx, cb, cbErr) {

    var self = this;
    var sql  = "PRAGMA table_info(\"" + this.table.META.name + "\")";
    if (storago.debug) console.log(sql);
    tx.executeSql(sql, [], function(rowset) {
      var columns = {};
      for (var r in rowset) {
        var row = rowset[r];
        columns[row.name] = row.type;
      };

      if (storago.debug) console.log(columns);
      cb(columns);

    }, function(tx, err){
      err.name  = self.table.META.name;
      err.action = 'info';
      if(!!cbErr) cbErr(tx, err);
    });
  };

  var infoWEB = function(table) {
    this.table = table;
  };

  infoWEB.prototype.execute = function(tx, cb, cbErr) {

    try{

      var self = this;
      var table_name = this.table.META.name
      var sql = "select " + table_name + ".* from sqlite_master left join " + table_name + " on 1=1 limit 1";
      if (storago.debug) console.log(sql);
      tx.executeSql(sql, null, function(tx, result) {
        var row = result.rows[0];
        return cb(row);
      }, function(tx, err){
        err.name  = self.table.META.name;
        err.action = 'infoWeb';
        if(!!cbErr) cbErr(tx, err);
      });
    
    }catch(e){
    
      if(!!cbErr){
        
        cbErr(null, e);
      }else{
        
        throw e;
      }
    }
  }
  query.InfoWEB = infoWEB;

  //class query.Insert
  var insert = function(table) {
    this.table = table;
    this.columns = [];
    this.objects = [];
    this.values = [];
  };
  query.Insert = insert;

  insert.prototype.add = function(obj) {

    if(!obj._TABLE){
      var msg = "Is not valid object " + JSON.stringify(obj);
      throw msg;
    }
    
    if(obj._TABLE.META.name != this.table.META.name) {
      
      var msg = "(storago) No permission: object must be of class(" + this.table.META.name + ")";
      msg += ", but is the class(" + obj._TABLE.META.name + ")";
      throw msg;
    }

    this.objects.push(obj);
  };

  insert.prototype.parse = function() {

    this.values = [];
    this.columns = [];

    for (var prop in this.table.META.props)     this.columns.push(prop);
    for (var parent in this.table.META.parents) this.columns.push(parent + '_id');
    for (var o in this.objects) {
      var obj = this.objects[o];
      for (var c in this.columns) {
        var column = this.columns[c];
        var type = this.table.META.props[column];
        this.values.push(tools.fieldToDb(type, obj[column]));
      }
    }
  };

  insert.prototype.render = function() {

    this.parse();
    var sql = 'INSERT INTO ' + this.table.META.name + ' (';

    for (var c in this.columns) {
      sql += '"' + this.columns[c] + '"';
      if (c < this.columns.length - 1) sql += ', ';
    }

    sql += ') VALUES (';

    for (var o in this.objects) {
      var obj = this.objects[0];
      for (c in this.columns) {
        var column = this.columns[c];
        sql += '?';
        if (c < this.columns.length - 1) sql += ', ';
      }
      if (o < this.objects.length - 1) sql += '), ';
    }

    sql += ')';
    return sql;
  };

  insert.prototype.execute = function(tx, cb, cbErr) {

    var self = this;

    try{

      var sql  = this.render();

      if(storago.debug) console.log(sql, this.values);

      tx.executeSql(sql, this.values, cb, function(tx, err){

        var e = {
          error: err,
          sql: sql,
          values: self.values,
          name: self.table.META.name,
          action: 'insert',
        };

        if(!!cbErr) cbErr(tx, e);
      });
    
    }catch(err){

      var e = {
        error: err,
        values: this.values,
        name: this.table.META.name,
        action: 'insert',
      };

      if(typeof sql != 'undefined') e.sql = sql;
    
      if(!!cbErr){
        
        cbErr(null, e);
      }else{
        
        throw e;
      }

      console.log(e);
    }
  };

  //class query.Delete
  var del = function(table) {
    this.table = table;
    this.wheres = [];
    this.values = [];
  };
  query.Delete = del;

  del.prototype.where = function(where, value) {

    if (!Array.isArray(value) && value != undefined) value = [value];
    this.wheres.push([where, value]);
  };

  del.prototype.render = function() {

    var props = this.table.META.props;

    this.values = [];

    var sql = 'DELETE FROM ' + this.table.META.name;

    if (this.wheres.length) {
      sql += ' WHERE ';
      for (var w in this.wheres) {
        var where = this.wheres[w];
        var value = tools.fieldToDb(props[where[0]], where[1]);
        if (value != undefined) this.values = this.values.concat(value);
        sql += where[0];
        if ((this.wheres.length - 1) != w) sql += ' AND ';
      }
    }

    return sql;
  };

  del.prototype.execute = function(tx, cb, cbErr) {

    try{

      var self = this;
      var sql  = this.render();

      if (sql == null) {
        if (!cb) cb(tx);
        return;
      }

      if (storago.debug) console.log(sql, this.values);
      tx.executeSql(sql, this.values, cb, function(tx, err){
        err.name   = self.table.META.name;
        err.action = 'delete';
        if(!!cbErr) cbErr(tx, err);
      });

    }catch(e){
    
      if(!!cbErr){
        
        cbErr(null, e);
      }else{
        
        throw e;
      }
    }
  };

  //class query.Update
  var update = function(table) {

    this.table = table;
    this.wheres = [];
    this.columns = [];
    this.values = [];
  };
  query.Update = update;

  update.prototype.set = function(column, value) {

    this.columns.push([column, value]);
  };

  update.prototype.render = function() {

    var props = this.table.META.props;

    this.values  = [];

    if (this.columns.length == 0) return null;

    var sql = 'UPDATE ' + this.table.META.name + ' SET ';

    for (var c in this.columns) {
      var column = this.columns[c];
      sql += '"' + column[0] + '" = ?';
      var value = tools.fieldToDb(props[column[0]], column[1]);
      this.values.push(value);
      if ((this.columns.length - 1) != c) sql += ', ';
    }

    if (this.wheres.length) {
      sql += ' WHERE ';
      for (var w in this.wheres) {
        var where = this.wheres[w];
        var value = tools.fieldToDb(props[where[0]], where[1]);
        if (value != undefined) this.values = this.values.concat(value);
        sql += where[0];
        if ((this.wheres.length - 1) != w) sql += ' AND ';
      }
    }

    return sql;
  };

  update.prototype.where = function(where, value) {

    if (!Array.isArray(value) && value != undefined) value = [value];
    this.wheres.push([where, value]);
  };

  update.prototype.execute = function(tx, cb, cbErr) {

    var self = this;

    try{

      var sql  = this.render();

      if (sql == null) {
        if(cb) cb(tx);
        return;
      }

      if(storago.debug) console.log(sql, this.values);
      tx.executeSql(sql, this.values, cb, function(tx, err){
        
        console.log(err, cbErr);
        err.name   = self.table.META.name;
        err.action = 'update';
        if(!!cbErr){
          cbErr(tx, err);
          console.log('(storago)', err);
        }else{
          
          throw err;
        }
      });

    }catch(err){

      var e = {
        error: err,
        values: this.values,
        name: this.table.META.name,
        action: 'update',
      };

      if(typeof sql != 'undefined') e.sql = sql;

      if(!!cbErr){
        
        cbErr(null, e);
      }else{
        
        throw e;
      }
    }
  };

  //class query.Drop
  var drop = function(table) {

    this.table = table;
  };
  query.Drop = drop;

  drop.prototype.execute = function(tx, cb, cbErr) {
    var self = this;
    var sql  = 'DROP TABLE ' + this.table.META.name;
    if (storago.debug) console.log(sql);
    tx.executeSql(sql, [], cb, function(tx, err){
      err.name   = self.table.META.name;
      err.action = 'drop';
      if(!!cbErr) cbErr(tx, err);
    });
  };

  //class query.Truncate
  var truncate = function(table) {

    this.table = table;
  };
  query.Truncate = truncate;

  truncate.prototype.execute = function(tx, cb, cbErr) {

    var self = this;
    var drop = new query.Drop(this.table);
    var create = new query.Create(this.table);
    drop.execute(tx, function() {
      create.execute(tx, cb, cbErr);
    }, function(tx, err){
      err.name   = self.table.META.name;
      err.action = 'truncate';
      if(!!cbErr) cbErr(tx, err);
    });
  };

}(storago));
