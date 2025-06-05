function myFunction() {
  return 'Hello world!';
}

interface Person {
  name: string;
  age: number;
}

function test<T extends string | number>(x: T): Person {
  return typeof x === 'string' ? {
    age: 15,
    name: x
  } : {
    age: x,
    name: 'John'
  }
};
