storago.debug = true;

var Brand = storago.define('brands', {name: 'text'});

var Car = storago.define('cars', {type: 'text', color: 'text'});
Brand.hasMany('cars', Car, 'brand');


storago.connect('shop_car', '1.0', 'Showrow of cars', 5 * 1024 * 1024);
storago.schema(function(){

   fiat = new Brand();
   fiat.name = 'Fiat';
   fiat.save(function(row){
      var palio = new Car();
      palio.type = 'SW';
      palio.color = 'Black';
      palio.brand(row);
      palio.save(function(){


         console.log(fiat.cars() + '');
      });
   });

   var vw = new Brand();
   vw.name = 'Volkswagen';
   vw.save();

   Brand.find(1, function(row){
      row.name = 'Ford';
      row.save();
   });



});
