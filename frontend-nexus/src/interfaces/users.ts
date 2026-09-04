export interface User {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  image: string;
  age: number;
  company: { name: string; title: string };
}

export interface UsersResponse {
  users: User[];
  total: number;
  skip: number;
  limit: number;
}

export interface AddUserInput {
  firstName: string;
  lastName: string;
  email: string;
  age: number;
}

export interface AddUserResponse extends AddUserInput {
  id: number;
}
