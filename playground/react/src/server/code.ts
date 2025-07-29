import type { Person } from "../../types";

export function doGet() {
  return HtmlService.createTemplateFromFile('index').evaluate();
}

export function sayHello(name: string) {
  return `Hello, ${name}!`;
}

export interface Person2 {
  name: string;
  age: number;
  person: Person;
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
