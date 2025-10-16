import type { Person } from "../../types";

export interface Person2 {
  name: string;
  age: number;
  person: Person;
}

export const privateFunction_ = () => {
  return {} as Person2;
}
