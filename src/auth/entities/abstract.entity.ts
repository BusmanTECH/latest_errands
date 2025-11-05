
import {PrimaryGeneratedColumn, Column } from 'typeorm';


export class AbstractFileEntity<T> {

  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  name: string;

  @Column()
  url: string;  

  @Column()
  ext: string;  


  constructor(entity : Partial<T>){
    Object.assign(this, entity)
}

}