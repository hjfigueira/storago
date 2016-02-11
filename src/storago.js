var storago = {};
;(function(storago){

   //static property
   storago.debug = false;

   //local property
   var metadatas = [];

   //local function
   var Metadata = function(){
     this.dependents = {};
     this.parents = {};
     this.indexs = [];
   };

   //class Entry
   var Entry = function(name, prop){};
   Entry.prototype.rowid = null;

   Entry.prototype.save = function(cb){

      var self = this;

      if(this.rowid == null){
         var insert = new query.Insert(this._TABLE.META);
         insert.add(this);

         storago.db.transaction(function(tx){
            insert.execute(tx, function(tx, result){
               self.rowid = result.insertId;
               if(cb) cb(self);

            },function(tx, err){
               var msg = "(storago) " + err;
               throw msg;
            });
         });

      }else{

         var ondata = function(row){
            var data = row._DATA;
            var update = new query.Update(self._TABLE.META);

            for(var p in data){
               if(self[p] != data[p]){
                  update.set(p, self[p]);
               }
            }
            update.where('rowid = ?', row.rowid);

            storago.db.transaction(function(tx){
               update.execute(tx, cb, function(tx, err){
                  var msg = "(storago) " + err;
                  throw msg;
               });
            });
         };

         if(!this._DATA){
            this._TABLE.find(this.rowid, ondata);
         }else{
            ondata(this);
         }
      }
   };

   Entry.prototype.refresh = function(cb){

      var self = this;
      this._TABLE.find(this.rowid, function(row){
         for(var p in row) self[p] = row[p];
         if(cb) cb();
      });
   };

   Entry.find = function(rowid, cb, cbErr){
      var self = this;
      var select = this.select();
      select.where(this.META.name + '.rowid = ?', rowid);
      select.limit(1);
      storago.db.transaction(function(tx){
         select.execute(tx, function(tx, result){

            if(result.rows.length){
               var row  = result.rows.item(0);
               var entry = new self();
               entry._DATA = row;
               for(var p in row) entry[p] = row[p];
               if(cb) cb(entry);
            }

        }, function(tx, msg){
           if(cbErr) cbErr(msg);
           console.log('error', msg);
        });
     });
   };

   Entry.findBy = function(col, value, cb, cbErr){
      var self = this;
      var select = this.select();
      select.where(this.META.name + '.' + col + ' = ?', value);
      select.limit(1);
      storago.db.transaction(function(tx){
         select.execute(tx, function(tx, result){

            if(result.rows.length){
               var row  = result.rows.item(0);
               var entry = new self();
               entry._DATA = row;
               for(var p in row) entry[p] = row[p];
               if(cb) cb(entry);
            }else{
               cb(null);
               return;
            }

        }, function(tx, msg){
           if(cbErr) cbErr(msg);
           console.log('error', msg);
        });
     });
   };

   Entry.select = function(){
      var select = new query.Select(this.META);
      return select;
   };

   Entry.all = function(select, cb, cbErr){

      if(select && select.meta.name != this.META.name){
         var msg = "(storago) No permission: select must be of class(" + select.meta.name + ")" ;
         msg += ", but is the class(" + this.META.name + ")";
         throw msg;
         return;
      }

      if(select == null) select = this.select();
      var rowset = [];
      var self = this;
      storago.db.transaction(function(tx){
         select.execute(tx, function(tx, result){
            var rows = result.rows;
            for(var r = 0; r < rows.length; r++){
               var row = rows.item(r);
               var entry = new self();
               for(var p in row) entry[p] = row[p];
               entry._DATA = row;
               rowset.push(entry);
            }
            if(cb) cb(rowset);
         })
      });
   };

   Entry.one = function(select, cb, cbErr){
      if(select == null) select = this.select();
      select.limit(1);
      this.all(select, function(rowset){
         if(rowset.length == 0){
            cb(null); return;
         }
         cb(rowset[0]);
      }, cbErr);
   };

   Entry.index = function(index){
      this.META.indexs.push(index);
   };

   Entry.hasMany = function(many_name, child_entry, name){
      this.META.dependents[many_name] = child_entry;
      child_entry.META.parents[name] = this;
      var self = this;
      var ref_column = name + '_id';

      //config child
      child_entry.prototype[name] = function(item){

         if(typeof(item) == 'function'){// get mode

            self.find(this[ref_column], item);
            return;

         }else if(typeof(item) == 'object'){ // set mode

            if(item._TABLE && item._TABLE.META.name == self.META.name){
              this[ref_column] = item.rowid;
              return;
            }else{
              var msg = "(storago) No permission: object must be of class(" + self.META.name + ")" ;
              msg += ", but is the class(" + item._TABLE.META.name + ")";
              throw msg;
           }
        }
     };

     //config parent
     this.prototype[many_name] = function(){
        var select = child_entry.select();
        select.where(ref_column + ' = ?', this.rowid);
        return select;
     };
   };

   //static function connect
   storago.connect = function(name, version, description, size){
      storago.db = openDatabase(name, version, description, size);
   };

   //static function define
   storago.define = function(name, props){

     var meta = new Metadata();
     meta.name = name;
     meta.props = props;
     metadatas.push(meta);

     var row = function(){};
     for(var i in Entry) row[i] = Entry[i]; //clone Entry

     row.META = meta;
     row.prototype = new Entry();
     row.prototype._TABLE = row;

     return row;
   };

   //static function schema
   storago.schema = function(cb){

      var oncreate = function(i, tx){

         if(i > (metadatas.length-1)){
            if(cb) cb();
            return;
         }
         var meta = metadatas[i];
         var create = new query.Create(meta);
         var index  = new query.Index(meta);
         create.execute(tx, function(tx){
             index.execute(tx, function(tx){
                 oncreate(i+1, tx);
             });
         });
      }

     storago.db.transaction(function(tx){
        oncreate(0, tx);
     });
   };

   //static function reset
   storago.reset = function(){

      storago.db.transaction(function(tx){
         for(var m in metadatas){
            var meta = metadatas[m];
            var drop = new query.Drop(meta);
            drop.execute(tx);
         }
      });
   };

   //package query
   var query = {};
   storago.query = query;

   //class query.Select
   var select = function(meta){
      this.meta = meta;
      this._offset = null;
      this._limit = null;
      this._from = null;
      this._wheres = [];
      this._joins = [];
      this._columns = [];
      this._values = [];
      this._orders = [];
   }
   query.Select = select;

   select.prototype.limit = function(limit, offset){
      this._limit = limit;
      if(offset) this._offset = offset;
      return this;
   };

   select.prototype.order = function(col){
      if(col.search('ASC') < 0 && col.search('asc') < 0 &&
         col.search('DESC') < 0 && col.search('desc' < 0 )){
         col += ' ASC';
      }
      this._orders.push(col);
      return this;
   };

   select.prototype.where = function(where, data){
      this._wheres.push([where, data]);
      return this;
   };

   select.prototype.from = function(from, columns){
      this._from = from;
      if(columns == undefined) columns = ['*'];
      this._columns.push(from + '.rowid');
      for(var c in columns) this._columns.push(from + '.' + columns[c]);
      return this;
   };

   select.prototype.render = function(){

     if(this._from == null && this.meta) this.from(this.meta.name);

     var sql = 'SELECT';
     for(var c in this._columns){

        if(c == 0){
           sql += ' ';
        }else{
           sql += ', ';
        }
        sql += this._columns[c];
     }

     if(this._from != null) sql += ' FROM ' + this._from;

     if(this._wheres.length){
        sql += ' WHERE ';
        for(var w in this._wheres){
           var where = this._wheres[w];
           sql += where[0];
           if((this._wheres.length - 1) != w) sql += ' AND ';

           var value = where[1];
           if(value != undefined) this._values.push(value);
        }
     }

     if(this._orders.length){
        sql += ' ORDER BY ';
        for(var o in this._orders){
           sql += this._orders[o];
           if((this._orders.length - 1) != o) sql += ', ';
        }
     }

     if(this._limit != null)  sql += ' LIMIT ' + this._limit;
     if(this._offset != null) sql += ' OFFSET ' + this._offset;
     sql += ';';

     return sql;
   };

   select.prototype.toString = function(){
      return this.render();
   };

   select.prototype.execute = function(tx, cb, cbErr){
      var sql = this.render();
      if(storago.debug) console.log(sql, this._values);
      tx.executeSql(sql, this._values, cb, function(tx, err){
         var msg = "(storago) " + err.message;
         console.log(msg);
         if(cbErr) cbErr(tx, err);
      });
   };

   // Private package tools
   var tools = {};
   tools.fieldToDb = function(type, value){

       if(value == undefined)    return null;
       if(value instanceof Date) return value.getIso();

       var tof = typeof(value);
       if(type == 'INT' || type == 'NUMERIC'){
           if(tof == 'string'){
               return type == 'INT' ? parseInt(value) : parseFloat(value);
           }else if(tof == 'object'){
               return value.toString();
           }
       }

       if(tof == 'function') throw 'Function seted like property: ' + value;

       return value;
   };

   //class query.Index
   var index = function(meta){
       this.meta = meta;
       this.indexs = [];
   };
   query.Index = index;

   index.prototype.render = function(){

       var indexs = this.meta.indexs;
       for(var i in indexs){
           var index = indexs[i];
           var sql = "CREATE INDEX IF NOT EXISTS ";
           sql+= index + "_idx ON ";
           sql += this.meta.name + " (" + index + ");";
           this.indexs.push(sql);
       }
   };

   index.prototype.execute = function(tx, cb, cbErr){

       this.render();
       if(this.indexs.length == 0) cb(tx);
       var self = this;

       var onindex = function(i){
           if(self.indexs.length == i){ cb(tx); return;}

           var index = self.indexs[i];
           if(storago.debug) console.log(index);
           tx.executeSql(index, null, function(){
               onindex(i+1);
           }, function(tx, err){
               if(cbErr){
                   cbErr(err);
               }else{
                   throw "(storago) " + err.message;
               }
           });
       };

       onindex(0);
   };

   //class query.Create
   var create = function(meta){
      this.meta = meta;
      this.columns = [];
      this.indexs = [];
   };
   query.Create = create;

   create.prototype.parse = function(){

     for(var name in this.meta.props){
        var type = this.meta.props[name];
        this.columns.push(name + ' ' + type.toUpperCase());
     }

     for(var name in this.meta.parents){
        this.columns.push(name + '_id NUMERIC');
     }
   };

   create.prototype.render = function(){

     this.parse();
     var sql = 'CREATE TABLE IF NOT EXISTS ' + this.meta.name + '(';
     for(var c in this.columns){
       sql += this.columns[c];
       if((this.columns.length - 1) != c) sql += ', ';
     }
     sql += '); '

     return sql;
   };

   create.prototype.execute = function(tx, cb, cbErr){
      var sql = this.render();
      if(storago.debug) console.log(sql);
      tx.executeSql(sql, [], cb, cbErr);
   };

   //class query.Insert
   var insert = function(meta){
     this.meta = meta;
     this.columns = [];
     this.objects = [];
     this.values = [];
   };
   query.Insert = insert;

   insert.prototype.add = function(obj){

     if(!obj._TABLE || obj._TABLE.META.name != this.meta.name){
       var msg = "(storago) No permission: object must be of class(" + this.meta.name + ")" ;
       msg += ", but is the class(" + obj._TABLE.META.name + ")";

       throw msg;
     }

     this.objects.push(obj);
   };

   insert.prototype.parse = function(){

      this.values = [];
      for(var prop in this.meta.props) this.columns.push(prop);
      for(var parent in this.meta.parents) this.columns.push(parent + '_id');
      for(var o in this.objects){
         var obj = this.objects[o];
         for(c in this.columns){
            var column = this.columns[c];
            var type = this.meta.props[column];
            this.values.push(tools.fieldToDb(type, obj[column]));
        }
      }
   };

   insert.prototype.render = function(){

      this.parse();
      var sql = 'INSERT INTO ' + this.meta.name + ' (';

      for(var c in this.columns){
         sql += this.columns[c];
         if(c < this.columns.length-1) sql += ', ';
      }

      sql += ') VALUES (';

      for(var o in this.objects){
         var obj = this.objects[0];
         for(c in this.columns){
            var column = this.columns[c];
            sql += '?';
            if(c < this.columns.length-1) sql += ', ';
         }
         if(o < this.objects.length-1) sql += '), ';
      }

      sql += ')';
      return sql;
   };

   insert.prototype.execute = function(tx, cb, cbErr){
      var sql = this.render();
      if(storago.debug) console.log(sql, this.values);
      tx.executeSql(sql, this.values, cb, cbErr);
   };

   //class query.Update
   var update = function(meta){
      this.meta = meta;
      this.wheres = [];
      this.columns = [];
      this.values = [];
   };
   query.Update = update;

   update.prototype.set = function(column, value){
      this.columns.push([column, value]);
   };

   update.prototype.render = function(){

      this.values = [];
      if(this.columns.length == 0) return null;

      var sql = 'UPDATE ' + this.meta.name + ' ';

      for(var c in this.columns){
         var column = this.columns[c];
         sql += 'SET ' + column[0] + ' = ?';
         this.values.push(column[1]);
         if((this.columns.length - 1) != c) sql += ', ';
      }

      if(this.wheres.length){
         sql += ' WHERE ';
         for(var w in this.wheres){
            var where = this.wheres[w];
            var value = where[1];
            if(value != undefined) this.values.push(value);
            sql += where[0];
            if((this.wheres.length - 1) != w) sql += ' AND ';
         }
      }

      return sql;
   };

   update.prototype.where = function(where, value){
      this.wheres.push([where, value]);
   };

   update.prototype.execute = function(tx, cb, cbErr){
      var sql = this.render();
      if(sql == null){
         if(cb) cb(tx);
         return;
      }
      if(storago.debug) console.log(sql, this.values);
      tx.executeSql(sql, this.values, cb, cbErr);
   };

   //class query.Drop
   var drop = function(meta){
      this.meta = meta;
   };
   query.Drop = drop;

   drop.prototype.execute = function(tx, cb, cbErr){
      var sql = 'DROP TABLE ' + this.meta.name;
      if(storago.debug) console.log(sql);
      tx.executeSql(sql, cb, cbErr);
   };

}(storago));
