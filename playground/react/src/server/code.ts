import { type Person2, privateFunction_ } from "./module";

export function doGet() {
  return HtmlService.createTemplateFromFile('index').evaluate();
}

export function sayHello(name: string) {
  return `Hello, ${name}!`;
}

export interface Person3 {
  name: string;
  age: number;
  person: Person2;
}

export function getPerson<T extends string | number>(x: T): string {
  privateFunction_();
  return JSON.stringify( typeof x === 'string' ? {
    age: 15,
    name: x
  } : {
    age: x,
    name: 'John'
  })
};
