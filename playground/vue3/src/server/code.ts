export function doGet() {
  return HtmlService.createTemplateFromFile('index').evaluate();
}

export function sayHello(name: string) {
  return `Hello, ${name}!`;
}

export interface Person {
  name: string;
  age: number;
}

export function getPerson<T extends string | number>(x: T): string {
  return JSON.stringify( typeof x === 'string' ? {
    age: 15,
    name: x
  } : {
    age: x,
    name: 'John'
  })
};
